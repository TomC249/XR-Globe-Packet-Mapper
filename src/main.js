/**
 * main.js — Entry point
 * Bootstraps the Babylon scene and connects the data feed.
 */
import { GlobeScene } from './scene/GlobeScene.js';
import { DataFeed } from './data/DataFeed.js';

const canvas = document.getElementById('render-canvas');
const statusEl = document.getElementById('connection-status');
const statArcs = document.getElementById('stat-arcs');
const statFlows = document.getElementById('stat-flows');
const statRate = document.getElementById('stat-rate');
const statFps = document.getElementById('stat-fps');

// ── Bootstrap scene ────────────────────────────────────────────
const globe = new GlobeScene(canvas);
await globe.init();

// ── XR state ───────────────────────────────────────────────────
// Hide the 2D HTML overlay when inside an XR session; restore it on exit.
globe.onXRStateChange((inXR) => {
  const display = inXR ? 'none' : '';
  document.getElementById('hud').style.display          = display;
  document.getElementById('stats-panel').style.display  = display;
  document.getElementById('legend').style.display       = display;
});

// ── Data feed ──────────────────────────────────────────────────
// Change this URL to your WebSocket server endpoint
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8765';

const feed = new DataFeed(WS_URL);

feed.on('status', (status) => {
  statusEl.className = status;
  statusEl.textContent = `● ${status.toUpperCase()}`;
});

feed.on('flow', (flow) => {
  globe.addFlow(flow);
});

feed.connect();

// ── HUD update loop ────────────────────────────────────────────
let totalFlows = 0;
let bytesThisSecond = 0;
let lastRateReset = performance.now();

globe.on('flowAdded', (flow) => {
  totalFlows++;
  bytesThisSecond += flow.bytes ?? 0;
});

setInterval(() => {
  const now = performance.now();
  const elapsed = (now - lastRateReset) / 1000;
  const rate = bytesThisSecond / elapsed;

  statArcs.textContent = globe.activeArcCount;
  statFlows.textContent = totalFlows.toLocaleString();
  statRate.textContent = formatBytes(rate) + '/s';
  statFps.textContent = globe.fps.toFixed(0);

  globe.wristHUD?.update({
    arcs:  globe.activeArcCount,
    flows: totalFlows,
    rate:  formatBytes(rate) + '/s',
    fps:   globe.fps.toFixed(0),
  });

  bytesThisSecond = 0;
  lastRateReset = now;
}, 1000);

// ── Helpers ────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return bytes.toFixed(0) + ' B';
  if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 ** 2).toFixed(1) + ' MB';
}
