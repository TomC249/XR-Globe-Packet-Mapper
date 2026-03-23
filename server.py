#!/usr/bin/env python3
"""
server.py — WebSocket server for NetGlobe
==========================================
Architecture:
  tshark (live capture)
     └─► TsharkReader   — subprocess reading JSON-format output
          └─► GeoIPEnricher — resolves IPs to lat/lon
               └─► Database   — persists flows to SQLite
                    └─► WebSocketServer — broadcasts to all connected clients

Requirements:
  pip install websockets geoip2 aiosqlite

GeoIP:
  Download GeoLite2-City.mmdb from https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
  and place it alongside this file (or update GEOIP_DB_PATH).

Usage:
  sudo tshark -T json -l ... | python server.py
  OR:
  python server.py  (runs tshark itself as a subprocess)
"""

import asyncio
import json
import logging
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import websockets
import geoip2.database

# ── Config ─────────────────────────────────────────────────────────────────
WS_HOST       = '0.0.0.0'
WS_PORT       = 8765
DB_PATH       = Path('netglobe.db')
GEOIP_DB_PATH = Path('GeoLite2-City.mmdb')
TSHARK_BIN   = 'tshark'    # ensure tshark is in your PATH
TSHARK_IFACE  = 'Ethernet'   # change to your capture interface
TSHARK_FILTER = 'not (src net 192.168.0.0/16 or src net 10.0.0.0/8 or src net 172.16.0.0/12 or dst net 192.168.0.0/16 or dst net 10.0.0.0/8 or dst net 172.16.0.0/12)'
PCAP_FILE = r'testsample.pcapng'  # update this path

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('netglobe')

# ── Database ────────────────────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS flows (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            ts        REAL NOT NULL,
            src_ip    TEXT NOT NULL,
            dst_ip    TEXT NOT NULL,
            src_lat   REAL,
            src_lon   REAL,
            dst_lat   REAL,
            dst_lon   REAL,
            src_city  TEXT,
            dst_city  TEXT,
            protocol  TEXT,
            bytes     INTEGER DEFAULT 0
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ts ON flows(ts)")
    conn.commit()
    return conn

def insert_flow(conn, flow: dict):
    conn.execute("""
        INSERT INTO flows
            (ts, src_ip, dst_ip, src_lat, src_lon, dst_lat, dst_lon,
             src_city, dst_city, protocol, bytes)
        VALUES
            (:ts, :srcIp, :dstIp, :srcLat, :srcLon, :dstLat, :dstLon,
             :srcCity, :dstCity, :protocol, :bytes)
    """, flow)
    conn.commit()

# ── GeoIP ───────────────────────────────────────────────────────────────────
_geo_reader = None

def get_geo_reader():
    global _geo_reader
    if _geo_reader is None and GEOIP_DB_PATH.exists():
        _geo_reader = geoip2.database.Reader(str(GEOIP_DB_PATH))
    return _geo_reader

def resolve_ip(ip: str) -> dict:
    reader = get_geo_reader()
    if not reader:
        log.info('GEOIP: reader is None - mmdb not loaded!')
        return None
    try:
        r = reader.city(ip)
        lat = r.location.latitude
        lon = r.location.longitude
        # Reject if coordinates are None or both zero (unresolved)
        if lat is None or lon is None:
            log.debug(f'GEOIP: null coordinates for {ip}')
            return None
        return {
            'lat':  lat,
            'lon':  lon,
            'city': r.city.name or r.country.name or '',
        }
    except Exception as e:
        log.debug(f'GEOIP: failed for {ip}: {type(e).__name__}: {e}')
        return None
# ── Local IP Fallback ────────────────────────────────────────────────────────────    
def get_private_geo(ip: str) -> dict | None:

    private_prefixes = ('192.168.', '10.', '172.16.', '172.17.',
                        '172.18.', '172.19.', '172.20.', '172.21.',
                        '172.22.', '172.23.', '172.24.', '172.25.',
                        '172.26.', '172.27.', '172.28.', '172.29.',
                        '172.30.', '172.31.', '127.', '::1')
    if any(ip.startswith(p) for p in private_prefixes):
        # Update these to your actual location
        return {'lat': 53.48, 'lon': -2.24, 'city': 'Manchester'}
    return None


# ── tshark reader ────────────────────────────────────────────────────────────
def determine_protocol_ek(layers: dict) -> str:
    """Protocol detection for tshark ek format layer keys."""
    if 'http' in layers:
        return 'HTTPS' if 'tls' in layers or 'ssl' in layers else 'HTTP'
    if 'dns' in layers:
        return 'DNS'
    if 'icmp' in layers or 'icmpv6' in layers:
        return 'ICMP'
    if 'udp' in layers:
        return 'UDP'
    if 'tcp' in layers:
        return 'TCP'
    return 'OTHER'

def parse_packet(layers: dict) -> dict | None:
    try:
        ip   = layers.get('ip',   {})
        ipv6 = layers.get('ipv6', {})

        log.info(f'PARSE: layer keys = {list(layers.keys())}')

        addr_list = ip.get('ip_ip_addr') or ipv6.get('ipv6_ipv6_addr')
        log.info(f'PARSE: addr_list = {addr_list}')

        if not addr_list or len(addr_list) < 2:
            log.info('PARSE: dropped - no addr list')
            return None

        src_ip = addr_list[0]
        dst_ip = addr_list[1]
        log.info(f'PARSE: src={src_ip} dst={dst_ip}')

        src_geo = resolve_ip(src_ip) or get_private_geo(src_ip)
        dst_geo = resolve_ip(dst_ip) or get_private_geo(dst_ip)
        log.info(f'PARSE: src_geo={src_geo} dst_geo={dst_geo}')

        if not src_geo or not dst_geo:
            log.info(f'PARSE: dropped - no geo')
            return None

        frame  = layers.get('frame', {})
        bytes_ = int(frame.get('frame_frame_len', 0))
        raw_ts = frame.get('frame_frame_time_epoch', '0')
        try:
            ts = float(raw_ts)
        except ValueError:
            from datetime import datetime, timezone
            ts = datetime.fromisoformat(raw_ts.replace('Z', '+00:00')).timestamp()

        flow = {
            'ts':       ts,
            'srcIp':    src_ip,
            'dstIp':    dst_ip,
            'srcLat':   src_geo['lat'],
            'srcLon':   src_geo['lon'],
            'srcCity':  src_geo['city'],
            'dstLat':   dst_geo['lat'],
            'dstLon':   dst_geo['lon'],
            'dstCity':  dst_geo['city'],
            'protocol': determine_protocol_ek(layers),
            'bytes':    bytes_,
        }
        log.info(f'PARSE: success! flow={flow}')
        return flow

    except (KeyError, TypeError, ValueError) as e:
        log.info(f'PARSE: exception {type(e).__name__}: {e}')
        return None

# ── WebSocket server ─────────────────────────────────────────────────────────
connected_clients: set[websockets.WebSocketServerProtocol] = set()

async def ws_handler(websocket, path='/'):
    connected_clients.add(websocket)
    log.info(f'Client connected ({len(connected_clients)} total)')
    try:
        async for _ in websocket:
            pass  # we don't expect messages from the client
    except websockets.ConnectionClosed:
        pass
    finally:
        connected_clients.discard(websocket)
        log.info(f'Client disconnected ({len(connected_clients)} total)')

async def broadcast(flow: dict):
    if not connected_clients:
        return
    msg = json.dumps(flow)
    await asyncio.gather(
        *[ws.send(msg) for ws in list(connected_clients)],
        return_exceptions=True,
    )

# ── tshark subprocess ─────────────────────────────────────────────────────────
async def run_tshark(db_conn, loop):
    cmd = [
        TSHARK_BIN,
        '-r', PCAP_FILE,     # read from file instead of live interface
        '-T', 'ek',
        '-n',
    ]

    log.info(f'Reading pcap: {PCAP_FILE}')

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        limit=1024 * 1024 * 10,
    )

    async def log_stderr():
        async for line in proc.stderr:
            decoded = line.decode().strip()
            if decoded:
                log.info(f'tshark: {decoded}')
    asyncio.create_task(log_stderr())

    packet_count = 0
    flow_count = 0

    async for raw in proc.stdout:
        line = raw.decode('utf-8', errors='replace').strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue

        if 'layers' not in obj:
            continue

        packet_count += 1
        flow = parse_packet(obj['layers'])
        if flow:
            flow_count += 1
            insert_flow(db_conn, flow)
            await broadcast(flow)
            log.info(f'Flow: {flow["srcIp"]} ({flow["srcCity"]}) -> {flow["dstIp"]} ({flow["dstCity"]}) [{flow["protocol"]}]')

    log.info(f'Done. Parsed {packet_count} packets, {flow_count} mappable flows.')

# ── Entry point ───────────────────────────────────────────────────────────────
async def main():
    db_conn = init_db()
    log.info(f'Database: {DB_PATH}')

    if not GEOIP_DB_PATH.exists():
        log.warning(
            f'GeoIP database not found at {GEOIP_DB_PATH}. '
            'Download GeoLite2-City.mmdb from maxmind.com.'
        )

    server = await websockets.serve(ws_handler, WS_HOST, WS_PORT)
    log.info(f'WebSocket server listening on ws://{WS_HOST}:{WS_PORT}')

    await asyncio.gather(
        server.wait_closed(),
        run_tshark(db_conn, asyncio.get_event_loop()),
    )

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info('Shutting down.')
