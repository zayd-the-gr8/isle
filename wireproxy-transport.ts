import net from "node:net";

class SocketDataQueue {
	private chunks: Buffer[] = [];
	private waiters: Array<() => void> = [];
	private closed = false;

	get size(): number {
		return this.chunks.length;
	}

	put(chunk: Buffer): void {
		if (this.closed) return;
		this.chunks.push(chunk);
		this.waiters.shift()?.();
	}

	async get(): Promise<Buffer | null> {
		while (this.chunks.length === 0 && !this.closed) {
			await new Promise<void>((resolve) => this.waiters.push(resolve));
		}
		return this.chunks.shift() ?? null;
	}

	close(): void {
		this.closed = true;
		for (const resolve of this.waiters.splice(0)) resolve();
	}
}

export class WireproxyTCPSocket {
	readonly hostname: string;
	readonly port: number;
	readonly recv_buffer_size = 128;
	connected = false;
	paused = false;
	socket: net.Socket | null = null;

	private readonly dataQueue = new SocketDataQueue();
	private readBuffer = Buffer.alloc(0);
	private socketError: Error | null = null;
	private readonly proxyHost: string;
	private readonly proxyPort: number;

	constructor(hostname: string, port: number, proxyHost = "127.0.0.1", proxyPort = 25344) {
		this.hostname = hostname;
		this.port = port;
		this.proxyHost = proxyHost;
		this.proxyPort = proxyPort;
	}

	async connect(): Promise<void> {
		const socket = net.createConnection({
			host: this.proxyHost,
			port: this.proxyPort
		});
		this.socket = socket;
		socket.on("data", (chunk: Buffer) => {
			this.dataQueue.put(chunk);
			if (this.dataQueue.size >= this.recv_buffer_size) this.pause();
		});
		socket.on("error", (error) => {
			this.socketError = error;
			this.dataQueue.close();
		});
		socket.on("close", () => this.dataQueue.close());

		await new Promise<void>((resolve, reject) => {
			socket.once("connect", resolve);
			socket.once("error", reject);
		});

		try {
			socket.write(Buffer.from([5, 1, 0]));
			const greeting = await this.readExactly(2);
			if (greeting[0] !== 5 || greeting[1] !== 0) {
				throw new Error("Wireproxy SOCKS5 proxy rejected unauthenticated access.");
			}

			const hostname = Buffer.from(this.hostname);
			if (hostname.length === 0 || hostname.length > 255) {
				throw new RangeError("Destination hostname is not valid for SOCKS5.");
			}
			const port = Buffer.alloc(2);
			port.writeUInt16BE(this.port);
			socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, hostname.length]), hostname, port]));

			const response = await this.readExactly(4);
			if (response[0] !== 5 || response[1] !== 0) {
				throw new Error(`Wireproxy SOCKS5 connection failed with status ${response[1]}.`);
			}
			const addressLength =
				response[3] === 1
					? 4
					: response[3] === 4
						? 16
						: response[3] === 3
							? (await this.readExactly(1))[0]
							: -1;
			if (addressLength < 0) {
				throw new Error("Wireproxy SOCKS5 proxy returned an invalid address type.");
			}
			await this.readExactly(addressLength + 2);
			this.connected = true;
		} catch (error) {
			this.dataQueue.close();
			socket.destroy();
			this.socket = null;
			throw error;
		}
	}

	async recv(): Promise<Buffer | null> {
		if (this.readBuffer.length > 0) {
			const buffered = this.readBuffer;
			this.readBuffer = Buffer.alloc(0);
			return buffered;
		}
		const chunk = await this.dataQueue.get();
		if (this.paused && this.dataQueue.size < this.recv_buffer_size) {
			this.socket?.resume();
			this.paused = false;
		}
		return chunk;
	}

	async send(data: Buffer): Promise<void> {
		const socket = this.socket;
		if (!socket) throw new Error("Wireproxy socket is not connected.");
		await new Promise<void>((resolve, reject) => {
			socket.write(data, (error) => (error ? reject(error) : resolve()));
		});
	}

	async close(): Promise<void> {
		this.dataQueue.close();
		this.socket?.end();
		this.socket = null;
	}

	pause(): void {
		if (this.dataQueue.size >= this.recv_buffer_size) {
			this.socket?.pause();
			this.paused = true;
		}
	}

	resume(): void {
		if (!this.socket || !this.paused) return;
		this.socket.resume();
		this.paused = false;
	}

	private async readExactly(length: number): Promise<Buffer> {
		while (this.readBuffer.length < length) {
			const chunk = await this.dataQueue.get();
			if (!chunk) {
				throw this.socketError ?? new Error("Wireproxy SOCKS5 connection closed during handshake.");
			}
			this.readBuffer = Buffer.concat([this.readBuffer, chunk]);
		}
		const result = this.readBuffer.subarray(0, length);
		this.readBuffer = this.readBuffer.subarray(length);
		return result;
	}
}
