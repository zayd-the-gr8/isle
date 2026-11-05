import { css, createDelegate, type Component } from "dreamland/core";
import type { Frame } from "@mercuryworkshop/scramjet-controller";
import FlagEditor from "./components/FlagEditor";
import BrowserView from "./pages/BrowserView";
import RequestViewer from "./pages/RequestViewer";
import PlaygroundView from "./pages/Playground";
import { Omnibox } from "./pages/BrowserView";

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
		<div>
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
					{use(this.activeTab)
						.map((tab) => tab === "browser")
						.andThen(<Omnibox />)}
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
		background: black;
		box-sizing: border-box;
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
		border-bottom: 1px solid #4a4a4a;
		background: #0f0f0f;
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
		color: #a8a8a8;
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
		background: #181818;
		color: #d0d0d0;
	}
	.tab-button.active {
		background: #1f1f1f;
		color: #fff;
		border-color: #4a4a4a;
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
		background: #0f0f0f;
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
