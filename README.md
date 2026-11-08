<p align=center><img width=700 src=https://i.8upload.com/image/e388573df60f5ef3/bow-c.png>

---

Click [here](https://render.com/deploy?repo=https://github.com/zayd-the-gr8/isle) to create a new Render Blueprint from this repository and deploy the `scramjet-demo` free web service. The build prepares the WebAssembly rewriter and builds the demo; the service serves the demo and Wisp WebSocket endpoint from the same origin. The demo automatically uses `wss://<your-render-host>/wisp/` on HTTPS.
###### (dummified version) click the button to make your own link. 
<p align=center><img width=50 src=https://i.8upload.com/image/15d3b070e2cb8b72/bow-c-1.png>

---



<h4> Things You Can Use With /isle</h4>
<p align=center> 
  <a alt=Google> <img height="32" width="32" src="https://cdn.simpleicons.org/google/000000/ffffff" /> </a>
  <a alt=TikTok> <img height="32" width="32" src="https://cdn.simpleicons.org/tiktok/000000/ffffff" /> </a>
  <a alt=snap> <img height="32" width="32" src="https://cdn.simpleicons.org/snapchat/000000/ffffff" /> </a>
  <a alt=YouTube> <img height="32" width="32" src="https://cdn.simpleicons.org/YouTube/000000/ffffff" /> </a>
  <a alt=Insta> <img height="32" width="32" src="https://cdn.simpleicons.org/instagram/000000/ffffff" /> </a>
  <a alt=ChatGPT> <img height="32" width="32" src="https://cdn.simpleicons.org/chatbot/000000/ffffff" /> </a>
  <a alt=Reddit> <img height="32" width="32" src="https://cdn.simpleicons.org/reddit/000000/ffffff" /> </a>
  <a alt=X> <img height="32" width="32" src="https://cdn.simpleicons.org/x/000000/ffffff" /> </a>
  <a alt=discord> <img height="32" width="32" src="https://cdn.simpleicons.org/discord/000000/ffffff" /> </a>
  <a alt=spotify> <img height="32" width="32" src="https://cdn.simpleicons.org/spotify/000000/ffffff" /> </a>
  <a alt=GeForce Now> <img height="32" width="32" src="https://cdn.simpleicons.org/nvidia/000000/ffffff" /> </a>
</p>

Click the button to create a new Render Blueprint from this repository and deploy the `scramjet-demo` free web service. The build prepares the WebAssembly rewriter and builds the demo; the service serves the demo and Wisp WebSocket endpoint from the same origin. The demo automatically uses `wss://<your-render-host>/wisp/` on HTTPS.

<a href="https://render.com/deploy?repo=https://github.com/zayd-the-gr8/isle"><img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" /></a>

When you're done, share your link with me via email , at zayd@emailthing.xyz , or adamantium.claws on discord, so I can add your link to our database! 

this project uses some keys of scramjet ! this project couldn't be done without the dukes at <a href=https://github.com/MercuryWorkshop/scramjet> Mercury Workshop </p> 

all designs are made, copyright (c) ZAYD AHMED 

## Optional WireGuard egress on Render

The Render web service can route Wisp TCP connections through [Wireproxy](https://github.com/windtf/wireproxy) and a WireGuard peer. This can provide an alternate route when Render's shared datacenter IPs cannot reach a site. Wireproxy is a client, not a VPN provider, so you need a WireGuard client config from a VPN provider or a WireGuard server you control.

To enable it, add a secret environment variable named `WIREGUARD_CONFIG` in the Render dashboard and paste the complete WireGuard client config, including its `[Interface]` and `[Peer]` sections. Redeploy the service. Wireproxy listens only on `127.0.0.1`; its SOCKS port is not exposed publicly. Without this variable, the service keeps its normal direct-egress behavior. An invalid config prevents startup instead of silently falling back to direct egress.

The Render build downloads a pinned Wireproxy release and verifies its checksum. Wisp UDP streams remain disabled. The tunnel's availability and exit location depend on the WireGuard peer you configure; Render does not provision a VPN endpoint or guarantee that a given peer is reachable.
