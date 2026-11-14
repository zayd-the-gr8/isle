import { css, type Component, createState } from "dreamland/core";
import { CatchEscapedLinksPlugin, UrlWatcherPlugin } from "@mercuryworkshop/scramjet-utils";
import { versionInfo } from "@mercuryworkshop/scramjet";
import { cachePlugin, controller, getTransport } from "..";
import {
	demoSettingsDefaults,
	demoSettingsStore,
	normalizeHomeUrl,
	normalizeMaxRequests,
	normalizeTransport,
	normalizeWispUrl,
} from "../store";
import homepage from "./homepage.html?raw";
import type { Frame } from "@mercuryworkshop/scramjet-controller";

type BrowserTab = {
	id: number;
	url: string;
	isHomepage: boolean;
	zoom: number;
};

type BrowserTabRuntime = {
	frame: Frame | null;
	element: HTMLIFrameElement;
	token: string;
};

let nextTabId = 1;
const browserTabRuntime = new Map<number, BrowserTabRuntime>();

function createBrowserTab(): BrowserTab {
	const tab = {
		id: nextTabId++,
		url: "",
		isHomepage: true,
		zoom: 100,
	};
	browserTabRuntime.set(tab.id, {
		frame: null,
		element: document.createElement("iframe"),
		token: crypto.randomUUID(),
	});
	return tab;
}

const initialBrowserTab = createBrowserTab();

export const browserState = createState({
	url: "",
	frame: null! as Frame,
	tabs: [initialBrowserTab],
	activeTabId: initialBrowserTab.id,
	theme: "stark-night" as HomepageTheme,
});

const HOMEPAGE_PREFERENCES_KEY = "scramjet-demo-homepage-preferences-v1";
const HOMEPAGE_THEMES = [
	"stark-night",
	"stark-day",
	"captain-night",
	"captain-day",
	"wanda-night",
	"wanda-day",
	"spider-night",
	"spider-day",
	"hulk-night",
	"hulk-day",
	"iron-night",
	"iron-day",
] as const;
type HomepageTheme = (typeof HOMEPAGE_THEMES)[number];

const TAB_CLOAKS = {
	none: { title: "/isle", icon: "/isle-logo.svg" },
	gmail: { title: "Gmail", icon: "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Gmail_icon_%282026%29.svg/960px-Gmail_icon_%282026%29.svg.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=thumbnail&_=20260520102616" },
	coursera: {
		title: "Coursera",
		icon: "https://www.coursera.org/favicon.ico",
	},
	classroom: {
		title: "Google Classroom",
		icon: "https://classroom.google.com/favicon.ico",
	},
	clever: { title: "Clever", icon: "https://clever.com/favicon.ico" },
} as const;
type TabCloak = keyof typeof TAB_CLOAKS;

type HomepagePreferences = {
	theme: HomepageTheme;
	cloak: TabCloak;
	showClientCount: boolean;
};

const DEFAULT_HOMEPAGE_PREFERENCES: HomepagePreferences = {
	theme: "stark-night",
	cloak: "none",
	showClientCount: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isHomepageTheme(value: unknown): value is HomepageTheme {
	return typeof value === "string" && HOMEPAGE_THEMES.some((theme) => theme === value);
}

function isTabCloak(value: unknown): value is TabCloak {
	return typeof value === "string" && Object.hasOwn(TAB_CLOAKS, value);
}

function readHomepagePreferences(): HomepagePreferences {
	try {
		const raw = localStorage.getItem(HOMEPAGE_PREFERENCES_KEY);
		if (!raw) return { ...DEFAULT_HOMEPAGE_PREFERENCES };

		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) {
			throw new TypeError("Saved homepage preferences are not an object.");
		}

		return {
			theme: isHomepageTheme(parsed.theme) ? parsed.theme : DEFAULT_HOMEPAGE_PREFERENCES.theme,
			cloak: isTabCloak(parsed.cloak) ? parsed.cloak : DEFAULT_HOMEPAGE_PREFERENCES.cloak,
			showClientCount: parsed.showClientCount !== false,
		};
	} catch (error) {
		console.error("Unable to load saved homepage preferences.", error);
		return { ...DEFAULT_HOMEPAGE_PREFERENCES };
	}
}

export function getNavigationDestination(query: string): string {
	if (/^https?:\/\//i.test(query)) {
		return new URL(query).toString();
	}

	if (/^(?:localhost|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?$/i.test(query)) {
		return new URL(`https://${query}`).toString();
	}

	return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

function getActiveBrowserTab(): BrowserTab | undefined {
	return browserState.tabs.find((tab) => tab.id === browserState.activeTabId);
}

function getBrowserTabRuntime(tab: BrowserTab): BrowserTabRuntime {
	const runtime = browserTabRuntime.get(tab.id);
	if (!runtime) {
		throw new Error(`Browser tab ${tab.id} has no runtime.`);
	}
	return runtime;
}

function navigateBrowserTab(tab: BrowserTab, destination: string) {
	const runtime = getBrowserTabRuntime(tab);
	if (!runtime.frame) {
		throw new Error(`Browser tab ${tab.id} is not ready to navigate.`);
	}

	runtime.frame.go(destination);
	tab.url = destination;
	tab.isHomepage = false;
	browserState.tabs = [...browserState.tabs];
	if (browserState.activeTabId === tab.id) {
		browserState.url = destination;
	}
}

function getBrowserTabLabel(tab: BrowserTab): string {
	if (tab.isHomepage) return "New tab";

	try {
		return new URL(tab.url).hostname || "New tab";
	} catch {
		return "New tab";
	}
}

function setTabZoom(tab: BrowserTab, zoom: number) {
	tab.zoom = zoom;
	const scale = zoom / 100;
	const { element } = getBrowserTabRuntime(tab);
	element.style.zoom = String(scale);
	element.style.width = `${100 / scale}%`;
	element.style.height = `${100 / scale}%`;
	browserState.tabs = [...browserState.tabs];
}

function encodeBase64(value: string): string {
	const bytes = new TextEncoder().encode(value);
	let binary = "";
	const chunkSize = 0x8000;

	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}

	return btoa(binary);
}

function applyTabCloak(cloak: TabCloak) {
	const selectedCloak = TAB_CLOAKS[cloak];
	document.title = selectedCloak.title;
	const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
	if (!favicon) {
		throw new Error("The document is missing its favicon link.");
	}
	favicon.href = selectedCloak.icon;
}

export const Omnibox: Component = function (cx) {
	const navigate = () => {
		const query = browserState.url.trim();
		if (!query) return;

		try {
			const destination = getNavigationDestination(query);
			const tab = getActiveBrowserTab();
			if (!tab) return;
			navigateBrowserTab(tab, destination);
		} catch (error) {
			console.error("Unable to navigate to the browser address.", error);
		}
	};
	return (
		<form
			class="url-form"
			on:submit={(e: SubmitEvent) => {
				e.preventDefault();
				navigate();
			}}
			on:keydown={(event: KeyboardEvent) => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				navigate();
			}}
		>
			<div class="browser-omnibox-shell">
				<div class="omnibox-nav">
					<button
						type="button"
						class="nav-btn"
						aria-label="Go back"
						title="Go back"
						on:click={() => {
							const tab = getActiveBrowserTab();
							if (tab) getBrowserTabRuntime(tab).frame?.back();
						}}
					>
						<span class="material-symbols-outlined">arrow_back</span>
					</button>
					<button
						type="button"
						class="nav-btn"
						aria-label="Go forward"
						title="Go forward"
						on:click={() => {
							const tab = getActiveBrowserTab();
							if (tab) getBrowserTabRuntime(tab).frame?.forward();
						}}
					>
						<span class="material-symbols-outlined">arrow_forward</span>
					</button>
					<button
						type="button"
						class="nav-btn"
						aria-label="Reload page"
						title="Reload page"
						on:click={() => {
							const tab = getActiveBrowserTab();
							if (tab) getBrowserTabRuntime(tab).frame?.reload();
						}}
					>
						<span class="material-symbols-outlined">refresh</span>
					</button>
				</div>
				<input
					id="search"
					class="url-input"
					type="text"
					value={use(browserState.url)}
					on:input={(event: InputEvent) => {
						browserState.url = (event.target as HTMLInputElement).value;
					}}
					spellcheck="false"
					placeholder="Search or type a URL"
				/>
				<select
					class="zoom-select"
					aria-label="Page zoom"
					title="Page zoom"
					value={use(browserState.tabs, browserState.activeTabId).map(
						([tabs, activeTabId]) => tabs.find((tab) => tab.id === activeTabId)?.zoom ?? 100
					)}
					on:change={(event: Event) => {
						const tab = getActiveBrowserTab();
						const zoom = Number((event.target as HTMLSelectElement).value);
						if (tab && [50, 75, 90, 100, 110, 125, 150].includes(zoom)) {
							setTabZoom(tab, zoom);
						}
					}}
				>
					<option value="50">50%</option>
					<option value="75">75%</option>
					<option value="90">90%</option>
					<option value="100">100%</option>
					<option value="110">110%</option>
					<option value="125">125%</option>
					<option value="150">150%</option>
				</select>
			</div>
		</form>
	);
};
Omnibox.style = css`
	:scope {
		display: flex;
		align-items: center;
		/*padding: 0.25em 0.45em;*/
		background: var(--chrome-bg);
		border-bottom: 1px solid var(--chrome-border);
		min-width: 0;
		width: 100%;
	}
	.browser-omnibox-shell {
		display: flex;
		width: 100%;
		align-items: center;
		gap: 0.35em;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0;
		flex: 1;
	}
	.omnibox-nav {
		display: flex;
		align-items: center;
		gap: 0.15em;
		padding-right: 0.25em;
		border-right: 1px solid var(--chrome-border);
	}
	.nav-btn {
		border: 0;
		background: transparent;
		color: var(--chrome-muted);
		width: 1.5em;
		height: 1.5em;
		padding: 0;
		border-radius: 3px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			background-color 150ms ease,
			color 150ms ease,
			transform 150ms ease;
	}
	.nav-btn:hover {
		background: var(--chrome-hover);
		color: var(--chrome-text);
		transform: translateY(-1px);
	}
	.browser-omnibox-shell .material-symbols-outlined {
		font-size: 15px !important;
		line-height: 1 !important;
		font-variation-settings:
			"OPSZ" 20,
			"wght" 300,
			"FILL" 0,
			"GRAD" 0;
	}
	.url-input {
		box-sizing: border-box;
		width: 100%;
		padding: 0.22em 0.18em;
		font-size: 0.9em;
		border: 1px solid transparent;
		border-radius: 3px;
		background: transparent;
		color: var(--chrome-text);
		outline: none;
	}
	.url-input::placeholder {
		color: var(--chrome-muted);
	}
	.zoom-select {
		min-height: 26px;
		border: 1px solid var(--chrome-border);
		border-radius: 6px;
		background: var(--chrome-surface);
		color: var(--chrome-text);
		padding: 0 6px;
		font: inherit;
		font-size: 0.76em;
		cursor: pointer;
		transition:
			background-color 150ms ease,
			border-color 150ms ease;
	}
	.zoom-select:hover {
		border-color: var(--chrome-accent);
	}
`;

const BrowserView: Component<
	{
		active: boolean;
	},
	{},
	{
		frameContainer: HTMLDivElement;
	}
> = function (cx) {
	let homepageSource = "";
	let preferences: HomepagePreferences = { ...DEFAULT_HOMEPAGE_PREFERENCES };

	const activateTab = (tab: BrowserTab) => {
		browserState.activeTabId = tab.id;
		browserState.url = tab.url;
		for (const current of browserState.tabs) {
			const runtime = getBrowserTabRuntime(current);
			runtime.element.style.display = current.id === tab.id ? "block" : "none";
		}
		const runtime = getBrowserTabRuntime(tab);
		if (runtime.frame) browserState.frame = runtime.frame;
	};

	const removeTabFrame = (tab: BrowserTab) => {
		const runtime = getBrowserTabRuntime(tab);
		runtime.element.remove();
		if (!runtime.frame) {
			browserTabRuntime.delete(tab.id);
			return;
		}
		const frameIndex = controller.frames.indexOf(runtime.frame);
		if (frameIndex >= 0) controller.frames.splice(frameIndex, 1);
		browserTabRuntime.delete(tab.id);
	};

	const sendHomepageError = (tab: BrowserTab, message: string) => {
		const runtime = getBrowserTabRuntime(tab);
		runtime.element.contentWindow?.postMessage(
			{
				type: "scramjet-homepage-error",
				token: runtime.token,
				message,
			},
			"*"
		);
	};

	const mountTab = (tab: BrowserTab, goto?: string | null) => {
		const runtime = getBrowserTabRuntime(tab);
		runtime.element.style.display = browserState.activeTabId === tab.id ? "block" : "none";
		this.frameContainer.appendChild(runtime.element);
		const urlWatcher = new UrlWatcherPlugin((url) => {
			if (!browserState.tabs.some((current) => current.id === tab.id)) return;
			tab.url = url;
			tab.isHomepage = false;
			browserState.tabs = [...browserState.tabs];
			if (browserState.activeTabId === tab.id) {
				browserState.url = url;
			}
		});
		const catchEscapedLinks = new CatchEscapedLinksPlugin(
			(url) => new URL(`/?goto=${encodeURIComponent(url.href)}`, location.origin)
		);
		runtime.frame = controller.createFrame(runtime.element, {
			plugins: [cachePlugin, urlWatcher, catchEscapedLinks],
		});
		browserState.tabs = [...browserState.tabs];
		if (browserState.activeTabId === tab.id) browserState.frame = runtime.frame;

		runtime.element.addEventListener(
			"load",
			() => {
				runtime.element.contentWindow?.postMessage(
					{
						type: "scramjet-homepage-init",
						token: runtime.token,
						settings: preferences,
						runtimeSettings: {
							wispUrl: demoSettingsStore.wispUrl,
							transport: demoSettingsStore.transport,
							homeUrl: demoSettingsStore.homeUrl,
							maxRequests: demoSettingsStore.maxRequests,
						},
						runtimeDefaults: demoSettingsDefaults,
					},
					"*"
				);
				if (goto) {
					navigateBrowserTab(tab, goto);
					history.replaceState(null, "", location.href.split("?")[0]);
				}
			},
			{ once: true }
		);

		setTabZoom(tab, tab.zoom);
		runtime.element.src = `data:text/html;base64,${encodeBase64(
			homepageSource.replaceAll("{{PREFERENCE_TOKEN}}", runtime.token)
		)}`;
	};

	const openTab = () => {
		const tab = createBrowserTab();
		browserState.tabs = [...browserState.tabs, tab];
		activateTab(tab);
		mountTab(tab);
	};

	const closeTab = (tab: BrowserTab) => {
		const currentTabs = browserState.tabs;
		const closedIndex = currentTabs.findIndex((current) => current.id === tab.id);
		if (closedIndex < 0) return;
		removeTabFrame(tab);

		const remainingTabs = currentTabs.filter((current) => current.id !== tab.id);
		if (remainingTabs.length === 0) {
			const replacement = createBrowserTab();
			browserState.tabs = [replacement];
			activateTab(replacement);
			mountTab(replacement);
			return;
		}

		browserState.tabs = remainingTabs;
		if (browserState.activeTabId === tab.id) {
			activateTab(remainingTabs[Math.max(0, closedIndex - 1)]);
		}
	};

	cx.mount = async () => {
		await controller.wait();
		preferences = readHomepagePreferences();
		browserState.theme = preferences.theme;
		applyTabCloak(preferences.cloak);

		window.addEventListener("message", (event: MessageEvent<unknown>) => {
			if (!isRecord(event.data)) return;
			const tab = browserState.tabs.find(
				(current) => browserTabRuntime.get(current.id)?.element.contentWindow === event.source
			);
			if (!tab || event.data.token !== getBrowserTabRuntime(tab).token) return;

			if (event.data.type === "scramjet-homepage-navigate") {
				if (typeof event.data.query !== "string") {
					console.warn("Ignoring homepage navigation without a search query.");
					return;
				}

				const query = event.data.query.trim();
				if (!query) return;
				try {
					const destination = getNavigationDestination(query);
					navigateBrowserTab(tab, destination);
				} catch (error) {
					console.error("Unable to navigate from the homepage.", error);
					sendHomepageError(
						tab,
						error instanceof Error ? error.message : "Unable to open that address."
					);
				}
				return;
			}

			if (event.data.type === "scramjet-homepage-open-requests") {
				window.dispatchEvent(new Event("scramjet-demo-open-requests"));
				return;
			}

			if (event.data.type === "scramjet-homepage-open-dev-options") {
				window.dispatchEvent(new Event("scramjet-demo-open-dev-options"));
				return;
			}

			if (event.data.type === "scramjet-homepage-runtime-settings") {
				if (!isRecord(event.data.settings)) {
					sendHomepageError(tab, "Settings could not be read.");
					return;
				}

				try {
					const nextWispUrl = normalizeWispUrl(String(event.data.settings.wispUrl ?? ""));
					const nextTransport = normalizeTransport(String(event.data.settings.transport ?? ""));
					const nextHomeUrl = normalizeHomeUrl(String(event.data.settings.homeUrl ?? ""));
					const nextMaxRequests = normalizeMaxRequests(String(event.data.settings.maxRequests ?? ""));
					const transportChanged =
						nextWispUrl !== demoSettingsStore.wispUrl || nextTransport !== demoSettingsStore.transport;

					demoSettingsStore.wispUrl = nextWispUrl;
					demoSettingsStore.transport = nextTransport;
					demoSettingsStore.homeUrl = nextHomeUrl;
					demoSettingsStore.maxRequests = nextMaxRequests;
					if (transportChanged) {
						controller.setTransport(getTransport());
					}

					const runtime = getBrowserTabRuntime(tab);
					runtime.element.contentWindow?.postMessage(
						{
							type: "scramjet-homepage-runtime-settings-saved",
							token: runtime.token,
							settings: {
								wispUrl: nextWispUrl,
								transport: nextTransport,
								homeUrl: nextHomeUrl,
								maxRequests: nextMaxRequests,
							},
							statusMessage:
								event.data.statusMessage === "Defaults restored."
									? "Defaults restored."
									: "Settings saved.",
						},
						"*"
					);
				} catch (error) {
					console.error("Unable to apply demo settings.", error);
					sendHomepageError(tab, error instanceof Error ? error.message : "Failed to apply settings.");
				}
				return;
			}

			if (event.data.type !== "scramjet-homepage-settings") return;
			const nextSettings = event.data.settings;
			if (!isRecord(nextSettings) || !isHomepageTheme(nextSettings.theme) || !isTabCloak(nextSettings.cloak)) {
				console.warn("Ignoring invalid homepage settings message.");
				sendHomepageError(tab, "Invalid settings. Please choose an option from each list.");
				return;
			}

			const updatedPreferences: HomepagePreferences = {
				theme: nextSettings.theme,
				cloak: nextSettings.cloak,
				showClientCount: nextSettings.showClientCount !== false,
			};
			preferences.theme = updatedPreferences.theme;
			preferences.cloak = updatedPreferences.cloak;
			browserState.theme = updatedPreferences.theme;
			applyTabCloak(updatedPreferences.cloak);

			try {
				localStorage.setItem(HOMEPAGE_PREFERENCES_KEY, JSON.stringify(updatedPreferences));
			} catch (error) {
				console.error("Unable to save homepage preferences.", error);
				sendHomepageError(tab, "Settings applied, but could not be saved in this browser.");
			}
		});

		let realHomepage = homepage;
		realHomepage = realHomepage.replaceAll("{{SCRAMJET_VERSION}}", String(versionInfo.version));
		realHomepage = realHomepage.replaceAll("{{SCRAMJET_BUILD}}", String(versionInfo.build));
		realHomepage = realHomepage.replaceAll(
			"{{SCRAMJET_DATE_PRETTY}}",
			new Date(versionInfo.date).toLocaleString(undefined, {
				dateStyle: "short",
				timeStyle: "short",
			})
		);
		homepageSource = realHomepage;
		const goto = new URL(location.href).searchParams.get("goto");
		const firstTab = browserState.tabs.find((tab) => tab.id === browserState.activeTabId);
		if (firstTab) mountTab(firstTab, goto);
	};

	return (
		<div class={use(this.active).map((active) => `tab-panel browser-view ${active ? "active" : ""}`)}>
			<div class="chrome-tab-strip">
				<div class="chrome-tabs">
					{use(browserState.tabs).map((tabs) =>
						tabs.map((tab) => (
							<div
								class={use(browserState.activeTabId).map(
									(activeTabId) => `chrome-tab ${activeTabId === tab.id ? "active" : ""}`
								)}
							>
								<button
									type="button"
									class="chrome-tab-title"
									title={getBrowserTabLabel(tab)}
									on:click={() => activateTab(tab)}
								>
									<span class="chrome-tab-icon material-symbols-outlined">language</span>
									<span class="chrome-tab-label">{getBrowserTabLabel(tab)}</span>
								</button>
								<button
									type="button"
									class="chrome-tab-close"
									aria-label={`Close ${getBrowserTabLabel(tab)}`}
									title="Close tab"
									on:click={(event: MouseEvent) => {
										event.stopPropagation();
										closeTab(tab);
									}}
								>
									<span class="material-symbols-outlined">close</span>
								</button>
							</div>
						))
					)}
				</div>
				<button type="button" class="new-tab-button" aria-label="New tab" title="New tab" on:click={openTab}>
					<span class="material-symbols-outlined">add</span>
				</button>
			</div>
			<Omnibox />
			<div class="browser-frame-container" this={use(this.frameContainer)}></div>
		</div>
	);
};

BrowserView.style = css`
	:scope {
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 0;
		display: none;
		flex-direction: column;
	}
	:scope.active {
		display: flex;
	}

	.chrome-tab-strip {
		display: flex;
		align-items: end;
		gap: 5px;
		min-height: 36px;
		padding: 5px 8px 0;
		background: var(--chrome-bg);
		color: var(--chrome-text);
		border-bottom: 1px solid var(--chrome-border);
	}
	.chrome-tabs {
		display: flex;
		flex: 1;
		gap: 3px;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.chrome-tab {
		display: flex;
		align-items: center;
		flex: 0 1 220px;
		min-width: 92px;
		max-width: 240px;
		height: 31px;
		padding: 0 4px 0 9px;
		border: 1px solid transparent;
		border-bottom: 0;
		border-radius: 9px 9px 0 0;
		background: var(--chrome-surface);
		color: var(--chrome-muted);
		transition:
			background-color 170ms ease,
			color 170ms ease,
			border-color 170ms ease,
			transform 170ms ease;
		animation: tab-enter 180ms ease-out both;
	}
	.chrome-tab.active {
		background: var(--chrome-active);
		color: var(--chrome-text);
		border-color: var(--chrome-border);
		transform: translateY(-1px);
	}
	.chrome-tab-title {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 7px;
		min-width: 0;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-family: "Bitcount Grid Single", system-ui, sans-serif;
		font-size: 0.78em;
		text-align: left;
		cursor: pointer;
	}
	.chrome-tab-icon {
		flex: none;
		color: var(--chrome-accent);
		font-size: 14px !important;
	}
	.chrome-tab-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chrome-tab-close,
	.new-tab-button {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--chrome-muted);
		cursor: pointer;
		transition:
			background-color 150ms ease,
			color 150ms ease,
			transform 150ms ease;
	}
	.chrome-tab-close .material-symbols-outlined,
	.new-tab-button .material-symbols-outlined {
		font-size: 15px;
	}
	.chrome-tab-close:hover,
	.new-tab-button:hover {
		background: var(--chrome-hover);
		color: var(--chrome-text);
	}
	.new-tab-button {
		margin: 0 0 5px 1px;
	}
	.new-tab-button:hover {
		transform: rotate(90deg);
	}
	.browser-frame-container {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		background: var(--chrome-bg);
	}
	iframe {
		display: block;
		flex: none;
		border: none;
	}
	iframe[style*="display: block"] {
		animation: frame-enter 220ms ease-out both;
	}
	@keyframes tab-enter {
		from {
			opacity: 0;
			transform: translateY(5px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@keyframes frame-enter {
		from {
			opacity: 0.82;
		}
		to {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chrome-tab,
		.nav-btn,
		.zoom-select,
		.chrome-tab-close,
		.new-tab-button,
		iframe[style*="display: block"] {
			animation: none;
			transition: none;
			transform: none;
		}
	}
`;

export default BrowserView;
