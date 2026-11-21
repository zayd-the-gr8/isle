import { createStore } from "dreamland/core";

export type AvailableTransports = "libcurl" | "epoxy";

export const AVAILABLE_TRANSPORTS: ReadonlyArray<{
	value: AvailableTransports;
	label: string;
}> = [
	{ value: "libcurl", label: "Libcurl" },
	{ value: "epoxy", label: "Epoxy" },
];
const DEFAULT_WISP_URL =
	import.meta.env.VITE_WISP_URL ||
	`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/`;
const DEFAULT_TRANSPORT: AvailableTransports = "libcurl";
const DEFAULT_HOME_URL = "https://google.com";
const DEFAULT_MAX_REQUESTS = 200;

// Default Wisp servers the demo can choose between. The demo auto-picks the
// fastest one that is online. Users can always bring their own via the settings
// text input below.
export const DEFAULT_WISP_SERVERS: ReadonlyArray<{
	url: string;
	label: string;
}> = [
	{ url: "wss://lms.uacsnetwork.org/api/", label: "UACS Network" },
	{ url: "wss://zayds.wispbyte.app/", label: "Zayd's WispByte" },
];

export type WispServerInfo = {
	url: string;
	label: string;
	online: boolean | null; // null = not yet checked
	latencyMs: number | null; // ms, null when offline or unchecked
};

export const wispServerStatusStore = createStore<Record<string, WispServerInfo>>(
	{},
	{ ident: "scramjet-demo-wisp-statuses", backing: "localstorage", autosave: "auto" }
);

export const demoSettingsStore = createStore(
	{
		transport: DEFAULT_TRANSPORT as AvailableTransports,
		wispUrl: DEFAULT_WISP_URL,
		homeUrl: DEFAULT_HOME_URL,
		maxRequests: DEFAULT_MAX_REQUESTS,
	},
	{
		ident: "scramjet-demo-settings",
		backing: "localstorage",
		autosave: "auto",
	}
);

export function normalizeWispUrl(value: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new TypeError("Wisp URL is required.");
	}

	let normalized = trimmed;
	if (!normalized.startsWith("ws://") && !normalized.startsWith("wss://")) {
		normalized = `ws://${normalized}`;
	}

	const parsed = new URL(normalized);
	if (!parsed.pathname || parsed.pathname === "") {
		parsed.pathname = "/";
	}
	if (!parsed.pathname.endsWith("/")) {
		parsed.pathname = `${parsed.pathname}/`;
	}

	return parsed.toString();
}

export function normalizeHomeUrl(value: string) {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new TypeError("Home page URL is required.");
	}

	const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
		? trimmed
		: `https://${trimmed}`;

	return new URL(normalized).toString();
}

export function normalizeTransport(value: string): AvailableTransports {
	if (AVAILABLE_TRANSPORTS.some((t) => t.value === value)) {
		return value as AvailableTransports;
	}
	throw new TypeError(`Unknown transport: ${value}`);
}

export function normalizeMaxRequests(value: string | number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new TypeError("Request log limit must be a number.");
	}

	const rounded = Math.round(parsed);
	if (rounded < 10 || rounded > 5000) {
		throw new RangeError("Request log limit must be between 10 and 5000.");
	}

	return rounded;
}

export const demoSettingsDefaults = {
	wispUrl: normalizeWispUrl(DEFAULT_WISP_URL),
	transport: DEFAULT_TRANSPORT,
	homeUrl: normalizeHomeUrl(DEFAULT_HOME_URL),
	maxRequests: DEFAULT_MAX_REQUESTS,
};

// Probe a single Wisp server by opening a WebSocket and measuring connect time.
// Resolves offline if the connection does not open within timeoutMs.
export async function probeWispServer(url: string, timeoutMs = 6000): Promise<{
	online: boolean;
	latencyMs: number | null;
}> {
	const start = performance.now();
	let ws: WebSocket | null = null;
	let settled = false;

	return new Promise<{ online: boolean; latencyMs: number | null }>((resolve) => {
		const cleanup = () => {
			if (ws) {
				ws.onopen = null;
				ws.onerror = null;
				ws.onclose = null;
				try {
					ws.close();
				} catch {}
				ws = null;
			}
		};

		const timer = setTimeout(() => {
			if (!settled) {
				settled = true;
				cleanup();
				resolve({ online: false, latencyMs: null });
			}
		}, timeoutMs);

		try {
			ws = new WebSocket(url);
			ws.onopen = () => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					cleanup();
					resolve({ online: true, latencyMs: Math.round(performance.now() - start) });
				}
			};
			ws.onerror = () => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					cleanup();
					resolve({ online: false, latencyMs: null });
				}
			};
			ws.onclose = () => {
				if (!settled) {
					settled = true;
					clearTimeout(timer);
					cleanup();
					resolve({ online: false, latencyMs: null });
				}
			};
		} catch {
			if (!settled) {
				settled = true;
				clearTimeout(timer);
				resolve({ online: false, latencyMs: null });
			}
		}
	});
}

// Ping every default Wisp server, record each one's online/offline status and
// latency, and return the fastest online server (or null if none are online).
export async function refreshWispServerStatuses(): Promise<{
	fastest: { url: string; label: string } | null;
	results: WispServerInfo[];
}> {
	const results = await Promise.all(
		DEFAULT_WISP_SERVERS.map(async (server) => {
			const probe = await probeWispServer(server.url);
			const info: WispServerInfo = {
				url: server.url,
				label: server.label,
				online: probe.online,
				latencyMs: probe.latencyMs,
			};
			wispServerStatusStore[server.url] = info;
			return info;
		})
	);

	const online = results.filter((r) => r.online === true);
	online.sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity));
	const fastest = online[0]
		? { url: online[0]!.url, label: online[0]!.label }
		: null;

	return { fastest, results };
}

// Automatically select the fastest online default Wisp server, unless the user
// has saved a custom "bring your own" server URL.
export async function autoSelectWispServer(): Promise<void> {
	const current = demoSettingsStore.wispUrl;
	const isDefaultUrl = current === DEFAULT_WISP_URL;
	const isDefaultServer = DEFAULT_WISP_SERVERS.some((s) => current === normalizeWispUrl(s.url));

	if (!isDefaultUrl && !isDefaultServer) {
		// User has a custom saved server; respect it.
		return;
	}

	const { fastest } = await refreshWispServerStatuses();
	if (fastest) {
		demoSettingsStore.wispUrl = normalizeWispUrl(fastest.url);
	}
}
