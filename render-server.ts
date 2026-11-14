import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { TLSSocket } from "node:tls";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { WireproxyTCPSocket } from "./wireproxy-transport.ts";

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "packages/demo/dist");
const port = Number(process.env.PORT ?? 10000);
const wispPath = "/wisp/";
const maxWispConnections = 32;
const maxHttpConnections = 96;
const wireproxyAddress = { host: "127.0.0.1", port: 25344 };
const maintenanceKey = "scramjet:maintenance";
const adminPassword = process.env.MAINTENANCE_ADMIN_PASSWORD?.trim();
const adminSessions = new Set<string>();

type MaintenanceState = {
	enabled: boolean;
	message: string;
	startAt: string | null;
	endAt: string | null;
};

const defaultMaintenanceState: MaintenanceState = {
	enabled: false,
	message: "",
	startAt: null,
	endAt: null
};
let localMaintenanceState = defaultMaintenanceState;

function isMaintenanceState(value: unknown): value is MaintenanceState {
	if (!value || typeof value !== "object") return false;
	const state = value as Partial<MaintenanceState>;
	return (
		typeof state.enabled === "boolean" &&
		typeof state.message === "string" &&
		(state.startAt === null || typeof state.startAt === "string") &&
		(state.endAt === null || typeof state.endAt === "string")
	);
}

function validateMaintenanceState(state: MaintenanceState): void {
	if (state.message.length > 2000) {
		throw new Error("Maintenance message is too long.");
	}
	const starts = state.startAt ? Date.parse(state.startAt) : null;
	const ends = state.endAt ? Date.parse(state.endAt) : null;
	if (starts !== null && !Number.isFinite(starts)) {
		throw new Error("Start date is invalid.");
	}
	if (ends !== null && !Number.isFinite(ends)) {
		throw new Error("End date is invalid.");
	}
	if (starts !== null && ends !== null && ends < starts) {
		throw new Error("End date must be after the start date.");
	}
}

async function maintenanceStore(command: string[]): Promise<string | null> {
	const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
	const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
	if (!url || !token) return null;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(command),
		signal: AbortSignal.timeout(5000)
	});
	if (!response.ok) {
		throw new Error(`Maintenance storage returned HTTP ${response.status}.`);
	}
	const payload = (await response.json()) as { result?: unknown };
	return typeof payload.result === "string" ? payload.result : null;
}

async function getMaintenanceState(): Promise<MaintenanceState> {
	const stored = await maintenanceStore(["GET", maintenanceKey]);
	if (stored) {
		const parsed: unknown = JSON.parse(stored);
		if (!isMaintenanceState(parsed)) {
			throw new Error("Maintenance storage contains invalid state.");
		}
		validateMaintenanceState(parsed);
		return parsed;
	}
	return localMaintenanceState;
}

async function setMaintenanceState(state: MaintenanceState): Promise<void> {
	validateMaintenanceState(state);
	const serialized = JSON.stringify(state);
	const stored = await maintenanceStore(["SET", maintenanceKey, serialized]);
	if (
		process.env.UPSTASH_REDIS_REST_URL?.trim() &&
		process.env.UPSTASH_REDIS_REST_TOKEN?.trim() &&
		stored === null
	) {
		throw new Error("Maintenance storage did not confirm the update.");
	}
	localMaintenanceState = state;
}

function maintenanceIsActive(state: MaintenanceState): boolean {
	const now = Date.now();
	const starts = state.startAt ? Date.parse(state.startAt) : Number.NaN;
	const ends = state.endAt ? Date.parse(state.endAt) : Number.NaN;
	return (
		state.enabled &&
		(!state.startAt || Number.isFinite(starts) && now >= starts) &&
		(!state.endAt || Number.isFinite(ends) && now <= ends)
	);
}

function cookieValue(request: http.IncomingMessage, name: string): string | null {
	const cookies = request.headers.cookie?.split(";") ?? [];
	for (const cookie of cookies) {
		const [key, ...value] = cookie.trim().split("=");
		if (key === name) return decodeURIComponent(value.join("="));
	}
	return null;
}

function isAdmin(request: http.IncomingMessage): boolean {
	const session = cookieValue(request, "maintenance_admin");
	return session !== null && adminSessions.has(session);
}

function sameSecret(input: string, expected: string): boolean {
	const inputBuffer = Buffer.from(input);
	const expectedBuffer = Buffer.from(expected);
	return (
		inputBuffer.length === expectedBuffer.length &&
		timingSafeEqual(inputBuffer, expectedBuffer)
	);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new RangeError(`Invalid PORT: ${process.env.PORT}`);
}

let wireproxyProcess: ChildProcess | null = null;
let wireproxyDirectory: string | null = null;
let shuttingDown = false;

function runWireproxyCheck(binary: string, configPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(binary, ["--config", configPath, "--configtest"], {
			stdio: "inherit"
		});
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Wireproxy config validation failed with exit code ${code}.`));
		});
	});
}

async function waitForWireproxy(child: ChildProcess): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`Wireproxy exited during startup with code ${child.exitCode}.`);
		}
		try {
			await new Promise<void>((resolve, reject) => {
				const socket = net.createConnection(wireproxyAddress);
				socket.setTimeout(500);
				socket.once("connect", () => {
					socket.destroy();
					resolve();
				});
				socket.once("error", reject);
				socket.once("timeout", () => {
					socket.destroy();
					reject(new Error("Timed out waiting for Wireproxy SOCKS5 listener."));
				});
			});
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
	throw new Error("Wireproxy did not start its local SOCKS5 listener within 10 seconds.");
}

async function startWireproxy(): Promise<void> {
	const wireguardConfig = process.env.WIREGUARD_CONFIG?.trim();
	if (!wireguardConfig) return;

	const binary = resolve(dirname(fileURLToPath(import.meta.url)), ".render-bin/wireproxy");
	wireproxyDirectory = await mkdtemp(join(tmpdir(), "scramjet-wireproxy-"));
	const wireguardPath = join(wireproxyDirectory, "wireguard.conf");
	const wireproxyConfigPath = join(wireproxyDirectory, "wireproxy.conf");

	try {
		await writeFile(wireguardPath, `${wireguardConfig}\n`, { mode: 0o600 });
		await writeFile(
			wireproxyConfigPath,
			`WGConfig = ${wireguardPath}\n[Socks5]\nBindAddress = ${wireproxyAddress.host}:${wireproxyAddress.port}\n`,
			{ mode: 0o600 }
		);
		await runWireproxyCheck(binary, wireproxyConfigPath);
	} catch (error) {
		await rm(wireproxyDirectory, { recursive: true, force: true });
		wireproxyDirectory = null;
		throw error;
	}

	wireproxyProcess = spawn(binary, ["--config", wireproxyConfigPath], {
		stdio: "inherit"
	});
	wireproxyProcess.once("error", (error) => {
		console.error("Wireproxy failed to start:", error);
	});
	wireproxyProcess.once("exit", (code) => {
		if (!shuttingDown) {
			console.error(`Wireproxy exited unexpectedly with code ${code}.`);
		}
		if (wireproxyDirectory) {
			void rm(wireproxyDirectory, { recursive: true, force: true }).catch((error) => {
				console.error("Failed to remove temporary Wireproxy configuration:", error);
			});
			wireproxyDirectory = null;
		}
	});
	try {
		await waitForWireproxy(wireproxyProcess);
	} catch (error) {
		wireproxyProcess.kill("SIGTERM");
		await rm(wireproxyDirectory, { recursive: true, force: true });
		wireproxyDirectory = null;
		throw error;
	}
	console.log("Wireproxy is routing Wisp TCP connections through the configured WireGuard peer.");
}

wisp.options.allow_direct_ip = false;
wisp.options.allow_private_ips = false;
wisp.options.allow_loopback_ips = false;
wisp.options.allow_udp_streams = false;
wisp.options.stream_limit_total = 32;
wisp.options.stream_limit_per_host = 8;

const wispSockets = new Set<Duplex>();

function respond(
	response: http.ServerResponse,
	status: number,
	message: string,
	headers: http.OutgoingHttpHeaders = {}
) {
	response.writeHead(status, {
		"Content-Type": "text/plain; charset=utf-8",
		"Content-Length": Buffer.byteLength(message),
		"X-Content-Type-Options": "nosniff",
		...headers
	});
	response.end(message);
}

function contentType(filePath: string): string {
	switch (extname(filePath).toLowerCase()) {
		case ".css":
			return "text/css; charset=utf-8";
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
		case ".mjs":
			return "text/javascript; charset=utf-8";
		case ".json":
		case ".map":
			return "application/json; charset=utf-8";
		case ".png":
			return "image/png";
		case ".svg":
			return "image/svg+xml";
		case ".wasm":
			return "application/wasm";
		case ".woff":
			return "font/woff";
		case ".woff2":
			return "font/woff2";
		default:
			return "application/octet-stream";
	}
}

async function serveFile(request: http.IncomingMessage, response: http.ServerResponse) {
	if (request.method !== "GET" && request.method !== "HEAD") {
		respond(response, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
		return;
	}

	let pathname: string;
	try {
		pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
	} catch {
		respond(response, 400, "Bad Request");
		return;
	}

	if (pathname.includes("\0")) {
		respond(response, 400, "Bad Request");
		return;
	}

	const filePath = resolve(publicDirectory, `.${pathname}`);
	if (filePath !== publicDirectory && !filePath.startsWith(`${publicDirectory}${sep}`)) {
		respond(response, 400, "Bad Request");
		return;
	}

	let targetPath = filePath;
	try {
		const fileInfo = await stat(targetPath);
		if (fileInfo.isDirectory()) targetPath = join(targetPath, "index.html");
	} catch (error) {
		if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
			throw error;
		}
		if (extname(targetPath)) {
			respond(response, 404, "Not Found");
			return;
		}
		targetPath = join(publicDirectory, "index.html");
	}

	const fileInfo = await stat(targetPath);
	if (!fileInfo.isFile()) {
		respond(response, 404, "Not Found");
		return;
	}

	response.writeHead(200, {
		"Content-Type": contentType(targetPath),
		"Content-Length": fileInfo.size,
		"Cache-Control": "no-cache",
		"X-Content-Type-Options": "nosniff"
	});
	if (request.method === "HEAD") {
		response.end();
		return;
	}

	const stream = createReadStream(targetPath);
	stream.on("error", (error) => {
		console.error(`Failed to stream ${targetPath}:`, error);
		response.destroy(error);
	});
	stream.pipe(response);
}

function expectedOrigin(request: http.IncomingMessage): string | null {
	const forwardedProto = request.headers["x-forwarded-proto"];
	const protocol =
		typeof forwardedProto === "string"
			? forwardedProto.split(",")[0].trim().toLowerCase()
			: request.socket instanceof TLSSocket
				? "https"
				: "http";

	if (protocol !== "http" && protocol !== "https") return null;
	if (!request.headers.host) return null;

	try {
		return new URL(`${protocol}://${request.headers.host}`).origin;
	} catch {
		return null;
	}
}

function isSameOriginWebSocket(request: http.IncomingMessage): boolean {
	const originHeader = request.headers.origin;
	const expected = expectedOrigin(request);
	if (!originHeader || !expected) return false;

	try {
		const origin = new URL(originHeader);
		return origin.origin === expected && originHeader === origin.origin;
	} catch {
		return false;
	}
}

function rejectUpgrade(socket: Duplex, status: string) {
	socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function readJson(request: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk: string) => {
			body += chunk;
			if (body.length > 32_000) {
				reject(new Error("Request body is too large."));
				request.destroy();
			}
		});
		request.on("end", () => {
			try {
				resolve(JSON.parse(body));
			} catch {
				reject(new Error("Request body must be valid JSON."));
			}
		});
		request.on("error", reject);
	});
}

const server = http.createServer((request, response) => {
	let pathname: string;
	try {
		pathname = new URL(request.url ?? "/", "http://localhost").pathname;
	} catch {
		respond(response, 400, "Bad Request");
		return;
	}

	if (pathname === "/healthz") {
		respond(response, 200, "ok");
		return;
	}
	if (pathname === "/api/maintenance" && request.method === "GET") {
		void getMaintenanceState()
			.then((state) =>
				respond(
					response,
					200,
					JSON.stringify({
						...state,
						active: maintenanceIsActive(state)
					}),
					{ "Content-Type": "application/json; charset=utf-8" }
				)
			)
			.catch((error: unknown) => {
				console.error("Failed to read maintenance state:", error);
				respond(response, 503, "Maintenance status unavailable.");
			});
		return;
	}
	if (pathname === "/api/admin/login" && request.method === "POST") {
		void readJson(request)
			.then((body: unknown) => {
				const password =
					typeof body === "object" && body !== null && "password" in body
						? body.password
						: undefined;
				if (
					!adminPassword ||
					typeof password !== "string" ||
					!sameSecret(password, adminPassword)
				) {
					respond(response, 401, "Invalid administrator password.");
					return;
				}
				const session = randomBytes(32).toString("base64url");
				adminSessions.add(session);
				respond(response, 200, JSON.stringify({ ok: true }), {
					"Content-Type": "application/json; charset=utf-8",
					"Set-Cookie": `maintenance_admin=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
				});
			})
			.catch((error: unknown) => respond(response, 400, String(error)));
		return;
	}
	if (pathname === "/api/admin/logout" && request.method === "POST") {
		const session = cookieValue(request, "maintenance_admin");
		if (session) adminSessions.delete(session);
		respond(response, 204, "", {
			"Set-Cookie": "maintenance_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
		});
		return;
	}
	if (pathname === "/api/admin/maintenance" && request.method === "GET") {
		if (!isAdmin(request)) {
			respond(response, 401, "Administrator login required.");
			return;
		}
		void getMaintenanceState()
			.then((state) =>
				respond(response, 200, JSON.stringify(state), {
					"Content-Type": "application/json; charset=utf-8"
				})
			)
			.catch((error: unknown) => {
				console.error("Failed to read admin maintenance state:", error);
				respond(response, 503, "Maintenance state unavailable.");
			});
		return;
	}
	if (pathname === "/api/admin/maintenance" && request.method === "PUT") {
		if (!isAdmin(request)) {
			respond(response, 401, "Administrator login required.");
			return;
		}
		void readJson(request)
			.then(async (body: unknown) => {
				if (!isMaintenanceState(body)) {
					respond(response, 400, "Invalid maintenance settings.");
					return;
				}
				await setMaintenanceState(body);
				respond(response, 200, JSON.stringify(body), {
					"Content-Type": "application/json; charset=utf-8"
				});
			})
			.catch((error: unknown) => {
				console.error("Failed to update maintenance state:", error);
				respond(response, 400, "Could not save maintenance settings.");
			});
		return;
	}
	if (pathname === wispPath || pathname.startsWith(wispPath)) {
		respond(response, 426, "WebSocket Upgrade Required", {
			Upgrade: "websocket"
		});
		return;
	}

	void serveFile(request, response).catch((error: unknown) => {
		console.error("Failed to serve demo request:", error);
		if (response.headersSent) {
			response.destroy(error instanceof Error ? error : undefined);
		} else {
			respond(response, 500, "Internal Server Error");
		}
	});
});

server.maxConnections = maxHttpConnections;
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;

server.on("upgrade", (request, socket, head) => {
	if (request.url !== wispPath) {
		rejectUpgrade(socket, "404 Not Found");
		return;
	}
	if (!isSameOriginWebSocket(request)) {
		rejectUpgrade(socket, "403 Forbidden");
		return;
	}
	if (wispSockets.size >= maxWispConnections) {
		rejectUpgrade(socket, "429 Too Many Requests");
		return;
	}

	wispSockets.add(socket);
	socket.once("close", () => wispSockets.delete(socket));
	try {
		if (wireproxyProcess) {
			wisp.routeRequest(request, socket, head, {
				TCPSocket: class extends WireproxyTCPSocket {
					constructor(hostname: string, port: number) {
						super(hostname, port, wireproxyAddress.host, wireproxyAddress.port);
					}
				}
			});
		} else {
			wisp.routeRequest(request, socket, head);
		}
	} catch (error) {
		console.error("Failed to route Wisp WebSocket:", error);
		socket.destroy();
	}
});

await startWireproxy();
await stat(join(publicDirectory, "index.html"));
server.listen(port, "0.0.0.0", () => {
	console.log(`Scramjet demo and Wisp listening on port ${port}`);
});

function shutdown(signal: NodeJS.Signals) {
	shuttingDown = true;
	server.close();
	for (const socket of wispSockets) socket.destroy();
	wireproxyProcess?.kill(signal);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
