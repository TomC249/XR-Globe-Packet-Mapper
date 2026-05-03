// main.js - entry point, bootstraps the scene and connects the websocket feed
import { GlobeScene } from './scene/GlobeScene.js';
import { DataFeed } from './data/DataFeed.js';

const canvas = document.getElementById('render-canvas');
const statusEl = document.getElementById('connection-status');
const statArcs = document.getElementById('stat-arcs');
const statFlows = document.getElementById('stat-flows');
const statRate = document.getElementById('stat-rate');
const statFps = document.getElementById('stat-fps');

// ── Scene setup ─────────────────────────────────────────────────────────────
const globe = new GlobeScene(canvas);
await globe.init();

// hide the 2D HTML overlay when inside XR, restore it on exit
globe.onXRStateChange((inXR) => {
  const display = inXR ? 'none' : '';
  document.getElementById('hud').style.display          = display;
  document.getElementById('stats-panel').style.display  = display;
  document.getElementById('legend').style.display       = display;
});

// ── Data feed ───────────────────────────────────────────────────────────────
// override ws endpoint via ?ws=<url> query param for XR devices on the same LAN
// e.g. ?ws=ws://192.168.1.100:8765
const params = new URLSearchParams(window.location.search);
const wsUrlOverride = params.get('ws');
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const { hostname, port } = window.location;
const defaultWsUrl = `${wsProtocol}//${hostname}${port ? ':' + port : ''}/ws`;
const WS_URL = wsUrlOverride ?? (import.meta.env.VITE_WS_URL ?? defaultWsUrl);

const feed = new DataFeed(WS_URL);

feed.on('status', (status) => {
  statusEl.className = status;
  statusEl.textContent = `● ${status.toUpperCase()}`;
});

feed.on('flow', (flow) => {
  globe.addFlow(flow);
});

feed.connect();

// ── HUD update loop ─────────────────────────────────────────────────────────
let totalFlows = 0;
let bytesThisSecond = 0;
let lastRateReset = performance.now();

globe.on('flowAdded', (flow) => {
  totalFlows++;
  bytesThisSecond += flow.bytes ?? 0;
});

// refresh stats display every second
setInterval(() => {
  const now = performance.now();
  const elapsed = (now - lastRateReset) / 1000;
  const rate = bytesThisSecond / elapsed;

  statArcs.textContent = globe.activeArcCount;
  statFlows.textContent = totalFlows.toLocaleString();
  statRate.textContent = formatBytes(rate) + '/s';
  statFps.textContent = globe.fps.toFixed(0);

  bytesThisSecond = 0;
  lastRateReset = now;
}, 1000);

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return bytes.toFixed(0) + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 ** 2).toFixed(1) + ' MB';
}
