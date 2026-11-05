import {
	css,
	type Delegate,
	type Component,
	createState,
} from "dreamland/core";
import {
	CatchEscapedLinksPlugin,
	UrlWatcherPlugin,
} from "@mercuryworkshop/scramjet-utils";
import { versionInfo } from "@mercuryworkshop/scramjet";
import { cachePlugin, controller } from "..";
import { demoSettingsStore } from "../store";
import homepage from "./homepage.html?raw";
import type { Frame } from "@mercuryworkshop/scramjet-controller";

export const browserState = createState({
	url: demoSettingsStore.homeUrl,
	frame: null! as Frame,
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
	none: { title: "Scramjet Demo", icon: "/icon.png" },
	gmail: { title: "Gmail", icon: "https://mail.google.com/favicon.ico" },
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
};

const DEFAULT_HOMEPAGE_PREFERENCES: HomepagePreferences = {
	theme: "stark-night",
	cloak: "none",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isHomepageTheme(value: unknown): value is HomepageTheme {
	return (
		typeof value === "string" &&
		HOMEPAGE_THEMES.some((theme) => theme === value)
	);
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
			throw new TypeError(
				"Saved homepage preferences are not an object."
			);
		}

		return {
			theme: isHomepageTheme(parsed.theme)
				? parsed.theme
				: DEFAULT_HOMEPAGE_PREFERENCES.theme,
			cloak: isTabCloak(parsed.cloak)
				? parsed.cloak
				: DEFAULT_HOMEPAGE_PREFERENCES.cloak,
		};
	} catch (error) {
		console.error("Unable to load saved homepage preferences.", error);
		return { ...DEFAULT_HOMEPAGE_PREFERENCES };
	}
}

function getHomepageDestination(query: string): string {
	if (/^https?:\/\//i.test(query)) {
		return new URL(query).toString();
	}

	if (
		/^(?:localhost|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#]\S*)?$/i.test(
			query
		)
	) {
		return new URL(`https://${query}`).toString();
	}

	return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

function applyTabCloak(cloak: TabCloak) {
	const selectedCloak = TAB_CLOAKS[cloak];
	document.title = selectedCloak.title;
	const favicon =
		document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
	if (!favicon) {
		throw new Error("The document is missing its favicon link.");
	}
	favicon.href = selectedCloak.icon;
}

export const Omnibox: Component = function (cx) {
	const navigate = () => {
		if (!browserState.url.startsWith("http")) {
			browserState.url = `https://${browserState.url}`;
		}
		demoSettingsStore.homeUrl = browserState.url;
		browserState.frame?.go(browserState.url);
	};
	return (
		<form
			class="url-form"
			on:submit={(e: SubmitEvent) => {
				e.preventDefault();
				navigate();
			}}
		>
			<div class="browser-omnibox-shell">
				<div class="omnibox-nav" aria-hidden="true">
					<button
						type="button"
						class="nav-btn"
						on:click={() => browserState.frame?.back()}
					>
						<span class="material-symbols-outlined">
							arrow_back
						</span>
					</button>
					<button
						type="button"
						class="nav-btn"
						on:click={() => browserState.frame?.forward()}
					>
						<span class="material-symbols-outlined">
							arrow_forward
						</span>
					</button>
					<button
						type="button"
						class="nav-btn"
						on:click={() => browserState.frame?.reload()}
					>
						<span class="material-symbols-outlined">refresh</span>
					</button>
				</div>
				<input
					id="search"
					class="url-input"
					type="text"
					value={use(browserState.url)}
					spellcheck="false"
					placeholder="Enter URL or search..."
				/>
			</div>
		</form>
	);
};
Omnibox.style = css`
	:scope {
		display: flex;
		align-items: center;
		/*padding: 0.25em 0.45em;*/
		background: #0f0f0f;
		border-bottom: 1px solid #2a2a2a;
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
		border-right: 1px solid #2a2a2a;
	}
	.nav-btn {
		border: 0;
		background: transparent;
		color: #8f8f8f;
		width: 1.5em;
		height: 1.5em;
		padding: 0;
		border-radius: 3px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.nav-btn:hover {
		background: #1f1f1f;
		color: #d0d0d0;
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
		color: #e5e7eb;
		outline: none;
	}
	.url-input::placeholder {
		color: #6f7680;
	}
`;

const BrowserView: Component<
	{
		active: boolean;
	},
	{},
	{
		frameel: HTMLIFrameElement;
	}
> = function (cx) {
	cx.mount = async () => {
		await controller.wait();

		let urlWatcher = new UrlWatcherPlugin((url) => {
			browserState.url = url;
		});
		let catchEscapedLinks = new CatchEscapedLinksPlugin(
			(url) =>
				new URL(
					`/?goto=${encodeURIComponent(url.href)}`,
					location.origin
				)
		);
		browserState.frame = controller.createFrame(this.frameel, {
			plugins: [cachePlugin, urlWatcher, catchEscapedLinks],
		});
		const messageToken = crypto.randomUUID();
		const preferences = readHomepagePreferences();
		applyTabCloak(preferences.cloak);
		window.addEventListener("message", (event: MessageEvent<unknown>) => {
			if (
				event.source !== this.frameel.contentWindow ||
				!isRecord(event.data) ||
				event.data.token !== messageToken
			) {
				return;
			}

			if (event.data.type === "scramjet-homepage-navigate") {
				if (typeof event.data.query !== "string") {
					console.warn(
						"Ignoring homepage navigation without a search query."
					);
					return;
				}

				const query = event.data.query.trim();
				if (!query) return;

				let destination: string;
				try {
					destination = getHomepageDestination(query);
				} catch (error) {
					console.error(
						"Unable to parse the homepage address.",
						error
					);
					this.frameel.contentWindow?.postMessage(
						{
							type: "scramjet-homepage-error",
							token: messageToken,
							message: "That web address is not valid.",
						},
						"*"
					);
					return;
				}

				browserState.url = destination;
				demoSettingsStore.homeUrl = destination;
				browserState.frame?.go(destination);
				return;
			}

			if (event.data.type !== "scramjet-homepage-settings") return;
			const nextSettings = event.data.settings;
			if (
				!isRecord(nextSettings) ||
				!isHomepageTheme(nextSettings.theme) ||
				!isTabCloak(nextSettings.cloak)
			) {
				console.warn("Ignoring invalid homepage settings message.");
				this.frameel.contentWindow?.postMessage(
					{
						type: "scramjet-homepage-error",
						token: messageToken,
						message:
							"Invalid settings. Please choose an option from each list.",
					},
					"*"
				);
				return;
			}

			const updatedPreferences: HomepagePreferences = {
				theme: nextSettings.theme,
				cloak: nextSettings.cloak,
			};
			preferences.theme = updatedPreferences.theme;
			preferences.cloak = updatedPreferences.cloak;
			applyTabCloak(updatedPreferences.cloak);

			try {
				localStorage.setItem(
					HOMEPAGE_PREFERENCES_KEY,
					JSON.stringify(updatedPreferences)
				);
			} catch (error) {
				console.error("Unable to save homepage preferences.", error);
				this.frameel.contentWindow?.postMessage(
					{
						type: "scramjet-homepage-error",
						token: messageToken,
						message:
							"Settings applied, but could not be saved in this browser.",
					},
					"*"
				);
			}
		});
		this.frameel.addEventListener(
			"load",
			() => {
				this.frameel.contentWindow?.postMessage(
					{
						type: "scramjet-homepage-init",
						token: messageToken,
						settings: preferences,
					},
					"*"
				);
			},
			{ once: true }
		);
		let realHomepage = homepage;
		realHomepage = realHomepage.replaceAll(
			"{{SCRAMJET_VERSION}}",
			String(versionInfo.version)
		);
		realHomepage = realHomepage.replaceAll(
			"{{SCRAMJET_BUILD}}",
			String(versionInfo.build)
		);
		realHomepage = realHomepage.replaceAll(
			"{{SCRAMJET_DATE_PRETTY}}",
			new Date(versionInfo.date).toLocaleString(undefined, {
				dateStyle: "short",
				timeStyle: "short",
			})
		);
		realHomepage = realHomepage.replaceAll(
			"{{PREFERENCE_TOKEN}}",
			messageToken
		);
		this.frameel.src = `data:text/html;base64,${btoa(realHomepage)}`;

		let goto = new URL(location.href).searchParams.get("goto");
		if (goto) {
			browserState.frame?.go(goto);
			history.replaceState(null, "", location.href.split("?")[0]);
		}
	};

	return (
		<div
			class={use(this.active).map(
				(active) => `tab-panel browser-view ${active ? "active" : ""}`
			)}
		>
			<iframe this={use(this.frameel)}></iframe>
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

	iframe {
		background: white;
		flex: 1;
		border: none;
	}
`;

export default BrowserView;
