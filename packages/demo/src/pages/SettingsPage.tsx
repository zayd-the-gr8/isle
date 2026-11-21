import { css, type Component } from "dreamland/core";
import { controller, getTransport } from "..";
import FlagEditor from "../components/FlagEditor";
import {
	AVAILABLE_TRANSPORTS,
	type AvailableTransports,
	autoSelectWispServer,
	demoSettingsDefaults,
	demoSettingsStore,
	DEFAULT_WISP_SERVERS,
	normalizeHomeUrl,
	normalizeMaxRequests,
	normalizeTransport,
	normalizeWispUrl,
	refreshWispServerStatuses,
	type WispServerInfo,
	wispServerStatusStore,
} from "../store";

const SettingsView: Component<
	{},
	{
		wispUrlInput: string;
		transportInput: AvailableTransports;
		homeUrlInput: string;
		maxRequestsInput: string;
		status: string;
		error: string;
	},
	{}
> = function () {
	this.wispUrlInput ??= demoSettingsStore.wispUrl;
	this.transportInput ??= demoSettingsStore.transport;
	this.homeUrlInput ??= demoSettingsStore.homeUrl;
	this.maxRequestsInput ??= String(demoSettingsStore.maxRequests);
	this.status ??= "";
	this.error ??= "";
	this.refreshing ??= false;

	const currentServer = () =>
		DEFAULT_WISP_SERVERS.find((s) => normalizeWispUrl(s.url) === demoSettingsStore.wispUrl);

	const isCustomServer = () => {
		const current = demoSettingsStore.wispUrl;
		return !DEFAULT_WISP_SERVERS.some((s) => current === normalizeWispUrl(s.url));
	};

	const serverStatus = (url: string): WispServerInfo | null =>
		wispServerStatusStore[url] ?? null;

	const refreshStatus = async () => {
		this.refreshing = true;
		this.error = "";
		try {
			await refreshWispServerStatuses();
			this.status = "Wisp server statuses refreshed.";
		} catch (error) {
			this.error =
				error instanceof Error ? error.message : "Failed to refresh wisp statuses.";
		} finally {
			this.refreshing = false;
		}
	};

	const applyFastest = async () => {
		this.error = "";
		this.status = "Selecting fastest online wisp server...";
		await autoSelectWispServer();
		this.wispUrlInput = demoSettingsStore.wispUrl;
		this.status = `Using ${demoSettingsStore.wispUrl}`;
	};

	const syncInputsFromStore = () => {
		this.wispUrlInput = demoSettingsStore.wispUrl;
		this.transportInput = demoSettingsStore.transport;
		this.homeUrlInput = demoSettingsStore.homeUrl;
		this.maxRequestsInput = String(demoSettingsStore.maxRequests);
	};

	const applySettings = async () => {
		this.error = "";
		this.status = "Applying settings...";

		try {
			const nextWispUrl = normalizeWispUrl(this.wispUrlInput);
			const nextTransport = normalizeTransport(this.transportInput);
			const nextHomeUrl = normalizeHomeUrl(this.homeUrlInput);
			const nextMaxRequests = normalizeMaxRequests(this.maxRequestsInput);
			const wispChanged = nextWispUrl !== demoSettingsStore.wispUrl;
			const transportChanged = nextTransport !== demoSettingsStore.transport;

			demoSettingsStore.wispUrl = nextWispUrl;
			demoSettingsStore.transport = nextTransport;
			demoSettingsStore.homeUrl = nextHomeUrl;
			demoSettingsStore.maxRequests = nextMaxRequests;

			this.wispUrlInput = nextWispUrl;
			this.transportInput = nextTransport;
			this.homeUrlInput = nextHomeUrl;
			this.maxRequestsInput = String(nextMaxRequests);

			if (wispChanged || transportChanged) {
				controller.setTransport(getTransport());
			}
			this.status =
				wispChanged || transportChanged
					? "Settings saved. Transport updated for new requests."
					: "Settings saved.";
		} catch (error) {
			this.status = "";
			this.error =
				error instanceof Error ? error.message : "Failed to apply settings.";
		}
	};

	const resetDefaults = async () => {
		this.error = "";
		this.status = "Resetting settings...";
		this.wispUrlInput = demoSettingsDefaults.wispUrl;
		this.transportInput = demoSettingsDefaults.transport;
		this.homeUrlInput = demoSettingsDefaults.homeUrl;
		this.maxRequestsInput = String(demoSettingsDefaults.maxRequests);
		await applySettings();
	};

	return (
		<div class="settings-panel">
			<div class="settings-header">
				<h2>Demo Settings</h2>
				<p>
					Update runtime settings without rebuilding the demo. Wisp changes
					apply to future requests only.
				</p>
			</div>

			<div class="field">
				<span class="label">Default wisp servers</span>
				<p class="hint">
					The demo checks each server and automatically uses the fastest one
					that is online. Offline servers are never chosen.
				</p>
				<div class="server-list">
					{DEFAULT_WISP_SERVERS.map((server) => {
						const info = serverStatus(server.url);
						const selected = currentServer()?.url === server.url;
						const online = info?.online;
						const latency = info?.latencyMs;
						return (
							<div class={`server-row ${selected ? "selected" : ""}`}>
								<div class="server-info">
									<span class="server-label">{server.label}</span>
									<span class="server-url">{server.url}</span>
								</div>
								<div class="server-status">
									{info === null ? (
										<span class="badge offline">not checked</span>
									) : online === true ? (
										<span class="badge online">
											online{latency != null ? ` · ${latency} ms` : ""}
										</span>
									) : (
										<span class="badge offline">offline</span>
									)}
								</div>
								{info === null || online === false ? null : (
									<button
										type="button"
										class={selected ? "button selected" : "button"}
										on:click={() => {
											demoSettingsStore.wispUrl = normalizeWispUrl(server.url);
											this.wispUrlInput = demoSettingsStore.wispUrl;
											this.status = `Using ${server.label}`;
										}}>
										{selected ? "Selected" : "Use"}
									</button>
								)}
							</div>
						);
					})}
				</div>
				<div class="server-actions">
					<button type="button" on:click={refreshStatus} disabled={this.refreshing}>
						{this.refreshing ? "Checking…" : "Check status"}
					</button>
					<button type="button" class="primary" on:click={applyFastest}>
						Use fastest online
					</button>
				</div>
			</div>

			<label class="field">
				<span class="label">Wisp server (bring your own)</span>
				<input
					type="text"
					value={use(this.wispUrlInput)}
					spellcheck={false}
					on:input={(e: InputEvent) => {
						this.wispUrlInput = (e.target as HTMLInputElement).value;
					}}
				/>
				<span class="hint">
					Example: ws://localhost:4142/ — enter a custom wisp server to override the defaults.
				</span>
			</label>

			<label class="field">
				<span class="label">Transport</span>
				<select
					value={use(this.transportInput)}
					on:change={(e: Event) => {
						this.transportInput = (e.target as HTMLSelectElement)
							.value as AvailableTransports;
					}}
				>
					{AVAILABLE_TRANSPORTS.map((option) => (
						<option value={option.value}>{option.label}</option>
					))}
				</select>
				<span class="hint">
					Transport client used to dispatch outbound requests over Wisp.
				</span>
			</label>

			<label class="field">
				<span class="label">Home page URL</span>
				<input
					type="text"
					value={use(this.homeUrlInput)}
					spellcheck={false}
					on:input={(e: InputEvent) => {
						this.homeUrlInput = (e.target as HTMLInputElement).value;
					}}
				/>
				<span class="hint">
					Used as the default browser URL and can be pushed into the omnibox.
				</span>
			</label>

			<label class="field">
				<span class="label">Request log limit</span>
				<input
					type="number"
					min="10"
					max="5000"
					step="10"
					value={use(this.maxRequestsInput)}
					on:input={(e: InputEvent) => {
						this.maxRequestsInput = (e.target as HTMLInputElement).value;
					}}
				/>
				<span class="hint">
					Maximum number of captured requests kept in memory.
				</span>
			</label>

			<div class="actions">
				<button type="button" class="primary" on:click={applySettings}>
					Apply Settings
				</button>
				<button type="button" on:click={resetDefaults}>
					Reset Defaults
				</button>
				<button
					type="button"
					on:click={() => {
						syncInputsFromStore();
						this.error = "";
						this.status = "Inputs reverted to saved settings.";
					}}
				>
					Revert Inputs
				</button>
			</div>

			{use(this.error).map((error) =>
				error ? <div class="message error">{error}</div> : null
			)}
			{use(this.status).map((status) =>
				status ? <div class="message status">{status}</div> : null
			)}

			<details class="dev-options">
				<summary>Dev options</summary>
				<FlagEditor embedded={true} />
			</details>
		</div>
	);
};

SettingsView.style = css`
	:scope {
		display: block;
		flex: 1;
		min-width: 0;
		min-height: 0;
		padding: 16px;
		background: #0f0f0f;
		color: #e5e7eb;
		overflow: auto;
		font-family:
			system-ui,
			-apple-system,
			"Segoe UI",
			sans-serif;
		box-sizing: border-box;
	}

	.settings-header {
		margin-bottom: 16px;
		padding-bottom: 12px;
		border-bottom: 1px solid #222;
	}

	.settings-header h2 {
		margin: 0 0 6px;
		font-size: 1rem;
		font-weight: 600;
	}

	.settings-header p {
		margin: 0;
		color: #a8a8a8;
		line-height: 1.45;
		font-size: 0.84rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 14px;
		max-width: 720px;
	}

	.label {
		font-size: 0.84rem;
		font-weight: 600;
		color: #e5e7eb;
	}

	input,
	select {
		width: 100%;
		padding: 0.55em 0.65em;
		border: 1px solid #2a2a2a;
		border-radius: 0;
		background: #111;
		color: #e5e7eb;
		font: inherit;
		font-size: 0.88rem;
		outline: none;
		box-sizing: border-box;
	}

	input:focus,
	select:focus {
		border-color: #4a4a4a;
	}

	select {
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		background-image:
			linear-gradient(45deg, transparent 50%, #8f8f8f 50%),
			linear-gradient(135deg, #8f8f8f 50%, transparent 50%);
		background-position:
			calc(100% - 14px) 50%,
			calc(100% - 9px) 50%;
		background-size:
			5px 5px,
			5px 5px;
		background-repeat: no-repeat;
		padding-right: 28px;
		cursor: pointer;
	}

	.hint {
		color: #8f8f8f;
		font-size: 0.78rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 18px;
	}

	button {
		border: 1px solid #2a2a2a;
		border-radius: 0;
		background: #1a1a1a;
		color: #e5e7eb;
		padding: 0.45em 0.8em;
		cursor: pointer;
		font: inherit;
		font-size: 0.82rem;
		line-height: 1.2;
		min-height: 28px;
	}

	button:hover {
		background: #222;
	}

	button.primary {
		border-color: #4a4a4a;
		background: #1f1f1f;
	}

	button.primary:hover {
		background: #262626;
	}

	.message {
		margin-top: 12px;
		padding: 0.65em 0.8em;
		border: 1px solid #2a2a2a;
		background: #111;
		font-size: 0.82rem;
		max-width: 720px;
	}

	.message.error {
		border-color: #5a2a2a;
		color: #e7b0b0;
	}

	.message.status {
		color: #b8c2cc;
	}

	.dev-options {
		max-width: 720px;
		margin-top: 20px;
		border: 1px solid #2a2a2a;
		background: #111;
	}

	.dev-options summary {
		padding: 0.75em 0.9em;
		color: #e5e7eb;
		cursor: pointer;
		font-size: 0.84rem;
		font-weight: 600;
		list-style-position: inside;
	}

	.dev-options[open] summary {
		border-bottom: 1px solid #2a2a2a;
	}

	.server-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 10px;
	}

	.server-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0.6em 0.8em;
		border: 1px solid #2a2a2a;
		border-radius: 0;
		background: #111;
	}

	.server-row.selected {
		border-color: #4a4a4a;
		background: #1a1a1a;
	}

	.server-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.server-label {
		font-size: 0.84rem;
		font-weight: 600;
		color: #e5e7eb;
	}

	.server-url {
		font-size: 0.72rem;
		color: #8f8f8f;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.server-status {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 0.15em 0.5em;
		border-radius: 0;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.badge.online {
		border: 1px solid #2a6a2a;
		background: #1a331a;
		color: #8fdd8f;
	}

	.badge.offline {
		border: 1px solid #5a2a2a;
		background: #331a1a;
		color: #e7b0b0;
	}

	.server-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}

	.server-actions button {
		flex: 0 0 auto;
	}
`;
export default SettingsView;
