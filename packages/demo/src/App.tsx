import { css, type Component } from "dreamland/core";
import FlagEditor from "./components/FlagEditor";
import BrowserView, { browserState } from "./pages/BrowserView";
import RequestViewer from "./pages/RequestViewer";
import PlaygroundView from "./pages/Playground";

const App: Component<
	{},
	{},
	{
		activeTab: "browser" | "playground" | "requests" | "dev-options";
	}
> = function (cx) {
	this.activeTab ??= "browser";
	cx.mount = () => {
		window.addEventListener("scramjet-demo-open-requests", () => {
			this.activeTab = "requests";
		});
		window.addEventListener("scramjet-demo-open-dev-options", () => {
			this.activeTab = "dev-options";
		});
	};
	return (
		<div class={use(browserState.theme).map((theme) => `app-root theme-${theme}`)}>
			<div class="top-bar">
				<div class="tab-bar">
					<button
						class={use(this.activeTab).map((tab) => `tab-button ${tab === "browser" ? "active" : ""}`)}
						on:click={() => {
							this.activeTab = "browser";
						}}
					>
						Browser
					</button>
					<button
						class={use(this.activeTab).map((tab) => `tab-button ${tab === "playground" ? "active" : ""}`)}
						on:click={() => {
							this.activeTab = "playground";
						}}
					>
						Playground
					</button>
				</div>
			</div>
			<div
				class={use(this.activeTab).map((tab) => `tab-panel browser-panel ${tab === "browser" ? "active" : ""}`)}
			>
				<BrowserView active={use(this.activeTab).map((tab) => tab === "browser")} />
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) => `tab-panel requests-panel ${tab === "requests" ? "active" : ""}`
				)}
			>
				<RequestViewer active={use(this.activeTab).map((tab) => tab === "requests")} />
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) => `tab-panel playground-panel ${tab === "playground" ? "active" : ""}`
				)}
			>
				<PlaygroundView active={use(this.activeTab).map((tab) => tab === "playground")} />
			</div>
			<div
				class={use(this.activeTab).map(
					(tab) => `tab-panel dev-options-panel ${tab === "dev-options" ? "active" : ""}`
				)}
			>
				<div class="dev-options-content">
					<div class="dev-options-heading">
						<h1>Dev options</h1>
						<button
							type="button"
							class="tab-button"
							on:click={() => {
								this.activeTab = "browser";
							}}
						>
							Back to browser
						</button>
					</div>
					<FlagEditor embedded={true} />
				</div>
			</div>
		</div>
	);
};

App.style = css`
	@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,400,0,0");

	:scope {
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		margin: 0;
		overflow: hidden;
		position: absolute;
		top: 0;
		left: 0;

		padding: 0;
		background: var(--chrome-bg);
		color: var(--chrome-text);
		box-sizing: border-box;
		--chrome-bg: #050505;
		--chrome-surface: #111;
		--chrome-active: #1c1c1c;
		--chrome-border: #333;
		--chrome-text: #f5f5f5;
		--chrome-muted: #aaa;
		--chrome-hover: #292929;
		--chrome-accent: #aaa;
	}
	:scope.theme-stark-day {
		--chrome-bg: #f4f3ef;
		--chrome-surface: #e9e8e2;
		--chrome-active: #fff;
		--chrome-border: #d3d1ca;
		--chrome-text: #202020;
		--chrome-muted: #666;
		--chrome-hover: #e1dfd7;
		--chrome-accent: #333;
	}
	:scope.theme-captain-night {
		--chrome-bg: #071426;
		--chrome-surface: #0c1e35;
		--chrome-active: #142a48;
		--chrome-border: #1d3655;
		--chrome-text: #edf5ff;
		--chrome-muted: #9ab2cf;
		--chrome-hover: #203b5e;
		--chrome-accent: #b7d5ff;
	}
	:scope.theme-captain-day {
		--chrome-bg: #e8f0fb;
		--chrome-surface: #dce8f7;
		--chrome-active: #fff;
		--chrome-border: #bfcee1;
		--chrome-text: #142b48;
		--chrome-muted: #506b8b;
		--chrome-hover: #d2e0f2;
		--chrome-accent: #244f83;
	}
	:scope.theme-wanda-night {
		--chrome-bg: #210d20;
		--chrome-surface: #30132e;
		--chrome-active: #401d3c;
		--chrome-border: #51264b;
		--chrome-text: #fff0fc;
		--chrome-muted: #d2a3cb;
		--chrome-hover: #55214c;
		--chrome-accent: #ffc2f1;
	}
	:scope.theme-wanda-day {
		--chrome-bg: #fff0fa;
		--chrome-surface: #f9e3f2;
		--chrome-active: #fffaff;
		--chrome-border: #e7bfdc;
		--chrome-text: #421a39;
		--chrome-muted: #805274;
		--chrome-hover: #f3d9eb;
		--chrome-accent: #8c326f;
	}
	:scope.theme-spider-night {
		--chrome-bg: #20090b;
		--chrome-surface: #311012;
		--chrome-active: #451416;
		--chrome-border: #572024;
		--chrome-text: #fff0f0;
		--chrome-muted: #d59b9d;
		--chrome-hover: #5a1b20;
		--chrome-accent: #ffb1b1;
	}
	:scope.theme-spider-day {
		--chrome-bg: #fff0ef;
		--chrome-surface: #fae3e1;
		--chrome-active: #fffafa;
		--chrome-border: #e8c1c1;
		--chrome-text: #421719;
		--chrome-muted: #805052;
		--chrome-hover: #f4d8d7;
		--chrome-accent: #a22930;
	}
	:scope.theme-hulk-night {
		--chrome-bg: #0c190c;
		--chrome-surface: #142514;
		--chrome-active: #1b3518;
		--chrome-border: #294b25;
		--chrome-text: #f0ffeb;
		--chrome-muted: #a6c99c;
		--chrome-hover: #274321;
		--chrome-accent: #c2ffa9;
	}
	:scope.theme-hulk-day {
		--chrome-bg: #eff8e9;
		--chrome-surface: #e2f0d9;
		--chrome-active: #fbfff8;
		--chrome-border: #c9dbbf;
		--chrome-text: #20371a;
		--chrome-muted: #58744e;
		--chrome-hover: #d8e9cf;
		--chrome-accent: #3b7028;
	}
	:scope.theme-iron-night {
		--chrome-bg: #1e1706;
		--chrome-surface: #30240a;
		--chrome-active: #40300d;
		--chrome-border: #594514;
		--chrome-text: #fff8df;
		--chrome-muted: #d1bd86;
		--chrome-hover: #55400f;
		--chrome-accent: #ffe28c;
	}
	:scope.theme-iron-day {
		--chrome-bg: #fff7dc;
		--chrome-surface: #f8edc8;
		--chrome-active: #fffdf5;
		--chrome-border: #e4d39d;
		--chrome-text: #3c2d0b;
		--chrome-muted: #79642f;
		--chrome-hover: #f2e5b7;
		--chrome-accent: #8b6711;
	}
	.material-symbols-outlined {
		font-family: "Material Symbols Outlined";
		font-weight: normal;
		font-style: normal;
		font-size: 11px;
		line-height: 1;
		letter-spacing: normal;
		text-transform: none;
		display: inline-block;
		white-space: nowrap;
		word-wrap: normal;
		direction: ltr;
		-webkit-font-smoothing: antialiased;
	}
	.top-bar {
		display: flex;
		align-items: stretch;
		gap: 0;
		margin-bottom: 0;
		border-bottom: 1px solid var(--chrome-border);
		background: var(--chrome-bg);
	}
	.tab-bar {
		display: flex;
		flex: 1;
		align-items: stretch;
		gap: 0;
	}
	.tab-button {
		border: 1px solid transparent;
		border-bottom: 0;
		background: transparent;
		color: var(--chrome-muted);
		padding: 0.24em 0.62em;
		border-radius: 0;
		cursor: pointer;
		font-size: 0.84em;
		line-height: 1.2;
		min-height: 28px;
		margin: 0;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
	}
	.tab-button:hover {
		background: var(--chrome-hover);
		color: var(--chrome-text);
	}
	.tab-button.active {
		background: var(--chrome-active);
		color: var(--chrome-text);
		border-color: var(--chrome-border);
		margin-bottom: -1px;
	}
	.tab-panel {
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 0;
		display: none;
	}
	.tab-panel.active {
		display: flex;
	}
	.requests-panel {
		flex-direction: column;
	}
	.dev-options-panel {
		overflow: auto;
		background: var(--chrome-bg);
		color: #e5e7eb;
		font-family:
			system-ui,
			-apple-system,
			"Segoe UI",
			sans-serif;
	}
	.dev-options-content {
		width: min(900px, 100%);
		margin: 0 auto;
		padding: 18px;
	}
	.dev-options-heading {
		display: flex;
		margin-bottom: 16px;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.dev-options-heading h1 {
		margin: 0;
		font-size: 1.1rem;
	}
	.playground-panel {
		width: 100%;
		min-width: 0;
		min-height: 0;
	}
`;
export default App;
