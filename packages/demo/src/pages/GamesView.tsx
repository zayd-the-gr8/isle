import { css, type Component } from "dreamland/core";
import { CatchEscapedLinksPlugin } from "@mercuryworkshop/scramjet-utils";
import { cachePlugin, controller } from "..";

const GamesView: Component<
	{},
	{},
	{
		frameContainer: HTMLDivElement;
		status: string;
	}
> = function (cx) {
	this.status = "Loading Obsidian games...";

	cx.mount = async () => {
		try {
			await controller.wait();

			const element = document.createElement("iframe");
			element.title = "Obsidian games";
			element.allow = "autoplay; fullscreen; gamepad; clipboard-read; clipboard-write";
			element.allowFullscreen = true;
			element.referrerPolicy = "strict-origin-when-cross-origin";
			element.style.display = "block";
			element.style.width = "100%";
			element.style.height = "100%";
			element.style.border = "0";
			element.style.background = "#fff";
			element.addEventListener("load", () => {
				this.status = "";
			});
			element.addEventListener("error", () => {
				this.status = "Unable to load Obsidian games. Check your connection and try again.";
			});
			this.frameContainer.appendChild(element);

			const frame = controller.createFrame(element, {
				plugins: [
					cachePlugin,
					new CatchEscapedLinksPlugin(
						(url) => new URL(`/?goto=${encodeURIComponent(url.href)}`, location.origin)
					)
				]
			});
			frame.go("https://playobsidian.com/");
		} catch (error) {
			console.error("Unable to initialize the Obsidian games view.", error);
			this.status = "Unable to load Obsidian games. Check your connection and try again.";
		}
	};

	return (
		<div class="games-view">
			<div class={use(this.status).map((status) => `games-status ${status ? "visible" : ""}`)}>
				{use(this.status)}
			</div>
			<div class="games-frame-container" this={use(this.frameContainer)}></div>
		</div>
	);
};

GamesView.style = css`
	:scope {
		position: relative;
		flex: 1;
		width: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		background: var(--chrome-bg);
	}
	.games-frame-container {
		position: absolute;
		inset: 0;
	}
	.games-status {
		position: absolute;
		z-index: 1;
		inset: 0;
		display: none;
		align-items: center;
		justify-content: center;
		padding: 24px;
		color: var(--chrome-muted);
		font-family: system-ui, sans-serif;
		text-align: center;
		pointer-events: none;
	}
	.games-status.visible {
		display: flex;
	}
`;

export default GamesView;
