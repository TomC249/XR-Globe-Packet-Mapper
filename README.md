# Network Traffic Visualiser

A Babylon.js globe that maps live network traffic flows as animated bezier arcs.

## Stack

| Layer | Tech |
|-------|------|
| Renderer | Babylon.js 7 |
| Bundler | Vite 5 |
| Capture | tshark (via subprocess) |
| GeoIP | MaxMind GeoLite2-City |
| Backend | Python asyncio + websockets |
| DB | SQLite (swap for Postgres trivially) |

---

## Quick Start

### 1. Frontend

```bash
npm install
npm run dev
```

The app opens at `http://localhost:3000`. It runs in **mock mode** automatically if no
WebSocket server is reachable — you'll see random flows between major cities.

### 2. Backend (Python)

```bash
pip install websockets geoip2
```

Download **GeoLite2-City.mmdb** from https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
and place it in the project root.

Set your capture interface in `server.py`:
```python
TSHARK_IFACE  = 'eth0'   # your interface
```

Run:
```bash
sudo python server.py
```

> `sudo` is required for tshark to open a raw socket on most systems.
> Alternatively, set `CAP_NET_RAW` on tshark: `sudo setcap cap_net_raw,cap_net_admin=eip $(which tshark)`

### 3. Configure frontend to hit your server

```bash
# .env.local
VITE_WS_URL=ws://your-server-ip:8765
```

---

## Data Flow

```
tshark subprocess
    │  JSON packets on stdout
    ▼
parse_packet()          ← extracts src/dst IP + protocol + bytes
    │
    ▼
GeoIP lookup            ← resolves each IP to {lat, lon, city}
    │
    ▼
SQLite INSERT           ← persists all flows for later replay
    │
    ▼
WebSocket broadcast     ← pushes to all connected browser clients
    │
    ▼
DataFeed.js             ← receives, fires 'flow' event
    │
    ▼
NetworkArcs.addArc()    ← computes bezier, creates tube mesh
    │
    ▼
Render loop tick()      ← animates GROW → HOLD → FADE lifecycle
```

---

## Project Structure

```
webxr-globe/
├── index.html              # Shell + HUD overlay
├── server.py               # Python WebSocket + tshark backend
├── src/
│   ├── main.js             # Bootstrap, HUD stats wiring
│   ├── scene/
│   │   ├── GlobeScene.js   # Engine, camera, lights, globe sphere, glow
│   │   ├── NetworkArcs.js  # Bezier arc rendering + lifecycle management
│   │   └── BorderLines.js  # World borders from TopoJSON
│   └── data/
│       └── DataFeed.js     # WebSocket client + mock fallback
├── package.json
└── vite.config.js
```

---

## Customisation

### Arc colours
Edit `PROTOCOL_COLORS` in `NetworkArcs.js`.

### Arc lifetime
Adjust `GROW_DURATION`, `HOLD_DURATION`, `FADE_DURATION` in `NetworkArcs.js`.

### Arc height
`ARC_HEIGHT_FACTOR` in `NetworkArcs.js` — higher values make arcs rise further above the globe.

### Globe textures
Swap the `EARTH_*_TEX` URLs in `GlobeScene.js` for local assets in `public/assets/`.

### Camera limits
`lowerRadiusLimit` / `upperRadiusLimit` in `GlobeScene.js` control how far you can zoom in/out.
---

### Replay from DB
```python
# Replay last N flows to a new client on connect
async def ws_handler(websocket, path):
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT * FROM flows ORDER BY ts DESC LIMIT 100"
    ).fetchall()
    for row in reversed(rows):
        await websocket.send(json.dumps(row_to_flow(row)))
    # ... then keep sending live flows
```
