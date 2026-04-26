/**
 * DataFeed.js
 * WebSocket client that connects to the backend and emits flow events.
 *
 * Expected server message format (JSON):
 * {
 *   "srcIp":   "1.2.3.4",
 *   "dstIp":   "5.6.7.8",
 *   "srcLat":  37.7749,
 *   "srcLon": -122.4194,
 *   "dstLat":  51.5074,
 *   "dstLon":  -0.1278,
 *   "protocol": "TCP",       // TCP | UDP | ICMP | DNS | HTTP | HTTPS
 *   "bytes":    4096,
 *   "ts":       1700000000   // unix timestamp
 * }
 * if incoming/outcoming is "local" ip, will default to local server location.
 * While disconnected (or in dev with no server), falls back to
 * MOCK_MODE which generates realistic-looking random flows.
 */

const RECONNECT_DELAY_MS  = 3000;
const MOCK_MODE_DELAY_MS  = 200; // interval between mock events
const MOCK_CITIES = [
  { lat: 51.51,  lon: -0.13,   city: 'London'     },
  { lat: 40.71,  lon: -74.01,  city: 'New York'   },
  { lat: 35.68,  lon: 139.69,  city: 'Tokyo'      },
  { lat: 48.86,  lon:   2.35,  city: 'Paris'      },
  { lat: 37.77,  lon: -122.42, city: 'San Francisco' },
  { lat: 52.52,  lon:  13.41,  city: 'Berlin'     },
  { lat: 55.75,  lon:  37.62,  city: 'Moscow'     },
  { lat: 39.90,  lon: 116.41,  city: 'Beijing'    },
  { lat: -33.87, lon: 151.21,  city: 'Sydney'     },
  { lat:  1.35,  lon: 103.82,  city: 'Singapore'  },
  { lat: 19.43,  lon: -99.13,  city: 'Mexico City'},
  { lat: -23.55, lon: -46.63,  city: 'São Paulo'  },
  { lat: 28.61,  lon:  77.21,  city: 'New Delhi'  },
  { lat: 55.68,  lon:  12.57,  city: 'Copenhagen' },
  { lat: -1.29,  lon:  36.82,  city: 'Nairobi'    },
  { lat: 25.20,  lon:  55.27,  city: 'Dubai'      },
  { lat: 41.01,  lon:  28.96,  city: 'Istanbul'   },
  { lat: 59.91,  lon:  10.75,  city: 'Oslo'       },
  { lat: 45.42,  lon: -75.69,  city: 'Ottawa'     },
  { lat: 34.05,  lon: -118.24, city: 'Los Angeles'},
];
const PROTOCOLS = ['TCP', 'TCP', 'TCP', 'UDP', 'UDP', 'HTTPS', 'HTTP', 'DNS', 'ICMP'];
const MOCK_LOCAL_SERVER = {
  lat: 53.48,
  lon: -2.24,
  city: 'Local Server',
  ip: '127.0.0.1',
};

export class DataFeed {
  #url;
  #ws = null;
  #handlers = {};
  #mockTimer = null;
  #reconnectTimer = null;
  #intentionalClose = false;

  constructor(url) {
    this.#url = url;
  }

  // ── Public ────────────────────────────────────────────────────────────

  connect() {
    this.#intentionalClose = false;
    this.#tryConnect();
  }

  disconnect() {
    this.#intentionalClose = true;
    clearTimeout(this.#reconnectTimer);
    this.#stopMock();
    this.#ws?.close();
  }

  on(event, handler) {
    this.#handlers[event] = this.#handlers[event] ?? [];
    this.#handlers[event].push(handler);
  }

  // ── Private: WebSocket ────────────────────────────────────────────────

  #tryConnect() {
    this.#emit('status', 'connecting');

    try {
      this.#ws = new WebSocket(this.#url);
    } catch {
      this.#fallbackToMock();
      return;
    }

    this.#ws.onopen = () => {
      console.log('[DataFeed] WebSocket connected.');
      this.#stopMock();
      this.#emit('status', 'connected');
    };

    this.#ws.onmessage = (event) => {
      try {
        const flow = JSON.parse(event.data);
        this.#emit('flow', flow);
      } catch (err) {
        console.warn('[DataFeed] Bad message:', err);
      }
    };

    this.#ws.onclose = () => {
      if (this.#intentionalClose) return;
      console.log('[DataFeed] Disconnected — retrying in', RECONNECT_DELAY_MS, 'ms');
      this.#fallbackToMock();
      this.#reconnectTimer = setTimeout(() => this.#tryConnect(), RECONNECT_DELAY_MS);
    };

    this.#ws.onerror = () => {
      // onerror is always followed by onclose, so handling there is enough
    };
  }

  // ── Private: mock data ────────────────────────────────────────────────

  #fallbackToMock() {
    this.#emit('status', 'disconnected');
    if (this.#mockTimer) return; // already running

    console.log('[DataFeed] Running in MOCK mode — no server connection.');
    this.#mockTimer = setInterval(() => {
      const flow = this.#generateMockFlow();
      this.#emit('flow', flow);
    }, MOCK_MODE_DELAY_MS);
  }

  #stopMock() {
    clearInterval(this.#mockTimer);
    this.#mockTimer = null;
  }

  #generateMockFlow() {
    const src = MOCK_CITIES[Math.floor(Math.random() * MOCK_CITIES.length)];
    const dst = MOCK_LOCAL_SERVER;

    return {
      srcIp:    this.#randomIp(),
      dstIp:    dst.ip,
      srcLat:   src.lat  + (Math.random() - 0.5) * 2,
      srcLon:   src.lon  + (Math.random() - 0.5) * 2,
      dstLat:   dst.lat,
      dstLon:   dst.lon,
      srcCity:  src.city,
      dstCity:  dst.city,
      protocol: PROTOCOLS[Math.floor(Math.random() * PROTOCOLS.length)],
      bytes:    Math.floor(Math.random() ** 2 * 1_000_000 + 64),
      ts:       Date.now() / 1000,
    };
  }

  #randomIp() {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
  }

  #emit(event, data) {
    this.#handlers[event]?.forEach((h) => h(data));
  }
}
