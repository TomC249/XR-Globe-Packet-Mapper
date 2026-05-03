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

The app opens at `http://localhost:3000`, or your private ip. (it will tell you in the console) It runs in **mock mode** automatically if no WebSocket server is reachable, you'll see random flows between major cities.

### 2. Backend (Python)

```bash
pip install websockets geoip2
```

Download **GeoLite2-City.mmdb** from https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
and place it in the project root. you will need to make an account for this to work

Set your capture interface in `server.py`:
```python
PCAP_FILE = r'put_the_pcap_name_in_here.pcap'
```
pcapng files also work too.

Then run:
```bash
sudo python server.py
```

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
parse_packet()          ← extracts src/dst IP +     protocol + bytes
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
```

---

## Project Structure

```
XR-Globe-Packet-Mapper/
├── index.html              # Shell + HUD overlay
├── server.py               # Python WebSocket + tshark backend
├── vite.config.js
├── package.json
└── src/
    ├── main.js             # Bootstrap, HUD stats wiring
    ├── data/
    │   └── DataFeed.js     # WebSocket client + mock fallback
    ├── scene/
    │   ├── GlobeScene.js   # Engine, camera, lights, globe sphere, glow
    │   ├── NetworkArcs.js  # Bezier arc rendering + lifecycle management
    │   ├── ArcInfoPanel.js # In-scene panel for arc details
    │   └── GlobeLegend.js  # Protocol colour legend mesh (specifically for XR)
    ├── shaders/
    │   ├── earth.vertex.fx
    │   └── earth.fragment.fx
    ├── utils/
    │   └── MeshLine.js     # Thin-line mesh helper
    └── xr/
        ├── ControllerInput.js  # XR controller bindings
        └── HandInput.js        # Hand-tracking input #mostly unused.
```

---

## Customisation

### Arc colours
Edit `PROTOCOL_COLORS` in `NetworkArcs.js`.

### Arc lifetime
Adjust `GROW_DURATION`, `HOLD_DURATION`, `FADE_DURATION` in `NetworkArcs.js`.

### Arc height
`ARC_HEIGHT_FACTOR` in `NetworkArcs.js` higher values make arcs rise further above the globe.

### Camera limits
`lowerRadiusLimit` / `upperRadiusLimit` in `GlobeScene.js` control how far you can zoom in/out.
---