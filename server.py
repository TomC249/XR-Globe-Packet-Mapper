#!/usr/bin/env python3
"""
server.py — WebSocket server
==========================================
Architecture:
  tshark (live capture)
     └─► TsharkReader   — subprocess reading JSON-format output
          └─► GeoIPEnricher — resolves IPs to lat/lon
               └─► Database   — persists flows to SQLite
                    └─► WebSocketServer - broadcasts to all connected clients

Requirements:
  pip install websockets geoip2 aiosqlite

GeoIP:
  Download GeoLite2-City.mmdb from https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
  and place it alongside this file (or update GEOIP_DB_PATH).

Usage (Desktop):
  python server.py  (runs tshark as a subprocess, mock data on disconnect)

Usage (XR):
  1. Start server: python server.py
  2. Find your machine's IP address (e.g., 192.168.1.100)
  3. Thats it really
"""

import asyncio
import argparse
import json
import logging
import socket
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
TSHARK_IFACE  = 'Ethernet'   # change to your capture interface (not used really)
TSHARK_FILTER = 'not (src net 192.168.0.0/16 or src net 10.0.0.0/8 or src net 172.16.0.0/12 or dst net 192.168.0.0/16 or dst net 10.0.0.0/8 or dst net 172.16.0.0/12)'
PCAP_FILE = r'2025-01-22-traffic-analysis-exercise.pcap'  # update this path when needed

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('netglobe')

# ── Database ────────────────────────────────────────────────────────────────
#initialises db
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
        # Manchester is the location of the "local server" 
        return {'lat': 53.48, 'lon': -2.24, 'city': 'Manchester'}
    return None


# ── tshark reader ────────────────────────────────────────────────────────────
def determine_protocol_ek(layers: dict) -> str:
    """Protocol detection for tshark ek format layer keys."""
    if 'http' in layers:
        return 'HTTPS' if ('tls' in layers or 'ssl' in layers) else 'HTTP'
    if 'tls' in layers or 'ssl' in layers:
        return 'HTTPS'
    if 'dns' in layers:
        return 'DNS'
    if 'icmp' in layers or 'icmpv6' in layers:
        return 'ICMP'
    if 'udp' in layers:
        return 'UDP'
    if 'tcp' in layers:
        return 'TCP'
    return 'OTHER'

# ── Alert / IoC Rules ────────────────────────────────────────────────────────
#
# 2025-01-22 Malicious Google Authenticator ad → Latrodectus C2 infection
# PCAP sourced from : https://www.malware-traffic-analysis.net/2025/01/22/index.html
# Ref: Unit42 https://x.com/Unit42_Intel/status/1882448037030584611
#
# Confirmed malicious:
ALERT_IPS = {
    '5.252.153.241',    # Latrodectus C2  served payloads + beacon /1517096937
    '82.221.136.26',    # authenticatoor.org typosquat redirect (fake Google Auth i mean literally look at the name)
    '104.21.64.1',      # google-authenticator.burleson-appliance.net malicious ad landing
    '217.70.186.109',   # appointedtimeagriculture.com redirect hop
}

ALERT_DOMAINS = {
    'authenticatoor.org',                           # typosquat fake Google Authenticator
    'google-authenticator.burleson-appliance.net',  # malicious ad landing page
    'appointedtimeagriculture.com',                 # redirect intermediary
}

ALERT_URI_PATTERNS = [
    '/api/file/get-file/',  # C2 file-serving endpoint on 5.252.153.241
    '/1517096937',          # Latrodectus beacon ID
]

# ── False-positive rules (included to demonstrate FP tuning) ─────────────────
#
# These would alert on legitimate traffic if left active.
#
#   FP #1 demdex.net is Adobe Audience Manager (legitimate ad-tech).
#             Random-looking name causes it to be flagged by overly-broad rules.
#
#   FP #2 googleads.g.doubleclick.net is Google's ad-serving CDN.
#             Appears on many blocklists but is standard browser traffic.
#   'doubleclick.net' in ALERT_DOMAINS  →  would flag all Google ad impressions
#
# To activate for demonstration: 
# used in participant testing to see if they can discern false positives
ALERT_DOMAINS.add('demdex.net')
ALERT_DOMAINS.add('doubleclick.net')

def _domain_match(hostname: str | None, domains: set[str]) -> bool:
    """True if hostname equals or is a subdomain of any entry in domains."""
    if not hostname:
        return False
    hostname = hostname.lower().rstrip('.')
    for d in domains:
        if hostname == d or hostname.endswith('.' + d):
            return True
    return False

def check_flags(flow: dict) -> bool:
    """Return True if the flow matches any alert rule."""
    # Known-bad IPs (src or dst)
    if flow.get('srcIp') in ALERT_IPS or flow.get('dstIp') in ALERT_IPS:
        log.warning(f'ALERT: bad IP  {flow.get("srcIp")} → {flow.get("dstIp")}')
        return True

    # Known-bad domains (SNI, HTTP host, reverse-DNS hostname)
    for field in ('tlsSni', 'httpHost', 'dstHostname', 'srcHostname'):
        if _domain_match(flow.get(field), ALERT_DOMAINS):
            log.warning(f'ALERT: bad domain [{field}] {flow.get(field)}')
            return True

    # Known-bad URI patterns
    uri = flow.get('httpUri') or ''
    for pattern in ALERT_URI_PATTERNS:
        if pattern in uri:
            log.warning(f'ALERT: bad URI {uri[:80]}')
            return True

    return False

_rdns_cache: dict[str, str | None] = {}

def _gethostbyaddr(ip: str) -> str | None:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return None

async def reverse_dns(ip: str) -> str | None:
    if ip not in _rdns_cache:
        loop = asyncio.get_event_loop()
        _rdns_cache[ip] = await loop.run_in_executor(None, _gethostbyaddr, ip)
    return _rdns_cache[ip]

def _search_tls_sni(obj, depth: int = 0) -> str | None:
    """Recursively search any TLS layer structure for an SNI value."""
    if depth > 8:
        return None
    if isinstance(obj, list):
        for item in obj:
            result = _search_tls_sni(item, depth + 1)
            if result:
                return result
    elif isinstance(obj, dict):
        for key in ('tls_handshake_extensions_server_name',
                    'tls_tls_handshake_extensions_server_name'):
            v = _str(obj.get(key))
            if v:
                return v
        for v in obj.values():
            if isinstance(v, (dict, list)):
                result = _search_tls_sni(v, depth + 1)
                if result:
                    return result
    return None

def _first(*args):
    """Return the first truthy value."""
    for a in args:
        if a:
            return a
    return None

def _str(v) -> str | None:
    """Coerce a value to a non-empty string, or None."""
    if v is None:
        return None
    if isinstance(v, list):
        v = v[0] if v else None
    s = str(v).strip() if v is not None else ''
    return s or None

def _layer(layers: dict, key: str) -> dict:
    """Get a layer, safely handling cases where tshark returns a list of records."""
    v = layers.get(key, {})
    if isinstance(v, list):
        v = v[0] if v else {}
    return v if isinstance(v, dict) else {}

def extract_ports(layers: dict) -> tuple:
    tcp = _layer(layers, 'tcp')
    udp = _layer(layers, 'udp')
    src = _first(tcp.get('tcp_srcport'), tcp.get('tcp_tcp_srcport'),
                 udp.get('udp_srcport'), udp.get('udp_udp_srcport'))
    dst = _first(tcp.get('tcp_dstport'), tcp.get('tcp_tcp_dstport'),
                 udp.get('udp_dstport'), udp.get('udp_udp_dstport'))
    try:
        src = int(src) if src is not None else None
    except (ValueError, TypeError):
        src = None
    try:
        dst = int(dst) if dst is not None else None
    except (ValueError, TypeError):
        dst = None
    return src, dst

def extract_app_info(layers: dict) -> dict:
    http = _layer(layers, 'http')
    dns  = _layer(layers, 'dns')
    info = {}

    # HTTP/HTTPS application layer
    host   = _str(_first(http.get('http_host'),                  http.get('http_http_host')))
    uri    = _str(_first(http.get('http_request_full_uri'),       http.get('http_http_request_full_uri'),
                         http.get('http_request_uri'),            http.get('http_http_request_uri')))
    method = _str(_first(http.get('http_request_method'),         http.get('http_http_request_method')))
    status = _str(_first(http.get('http_response_code'),          http.get('http_http_response_code')))
    if host:   info['httpHost']   = host
    if uri:    info['httpUri']    = uri
    if method: info['httpMethod'] = method
    if status: info['httpStatus'] = status

    # DNS queries
    qname = _str(_first(dns.get('dns_qry_name'), dns.get('dns_dns_qry_name')))
    qtype = _str(_first(dns.get('dns_qry_type'), dns.get('dns_dns_qry_type')))
    if qname: info['dnsQuery'] = qname
    if qtype: info['dnsType']  = qtype

    # TLS SNI: search all records recursively; only present in the ClientHello
    sni = _search_tls_sni(layers.get('tls'))
    if sni: info['tlsSni'] = sni

    return info

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

        src_port, dst_port = extract_ports(layers)
        app_info = extract_app_info(layers)

        flow = {
            'ts':          ts,
            'srcIp':       src_ip,
            'dstIp':       dst_ip,
            'srcPort':     src_port,
            'dstPort':     dst_port,
            'srcHostname': None,
            'dstHostname': None,
            'srcLat':      src_geo['lat'],
            'srcLon':      src_geo['lon'],
            'srcCity':     src_geo['city'],
            'dstLat':      dst_geo['lat'],
            'dstLon':      dst_geo['lon'],
            'dstCity':     dst_geo['city'],
            'protocol':    determine_protocol_ek(layers),
            'bytes':       bytes_,
            **app_info,
        }
        flow['flagged'] = check_flags(flow)
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
async def run_tshark(db_conn, loop, pcap_file: str):
    cmd = [
        TSHARK_BIN,
        '-r', pcap_file,     # read from file instead of live interface
        '-T', 'ek',
        '-n',
    ]

    log.info(f'Reading pcap: {pcap_file}')

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

    buf = b''
    while True:
        chunk = await proc.stdout.read(65536)
        if not chunk:
            break
        buf += chunk
        lines = buf.split(b'\n')
        buf = lines[-1]
        for raw in lines[:-1]:
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
                # Prefer TLS SNI or HTTP Host (actual web names) for the destination hostname.
                # Fall back to reverse DNS only if neither is present.
                app_hostname = flow.get('tlsSni') or flow.get('httpHost')
                src_is_private = get_private_geo(flow['srcIp']) is not None
                dst_is_private = get_private_geo(flow['dstIp']) is not None
                if app_hostname:
                    flow['dstHostname'] = app_hostname
                    flow['srcHostname'] = None
                else:
                    flow['srcHostname'] = None if src_is_private else await reverse_dns(flow['srcIp'])
                    flow['dstHostname'] = None if dst_is_private else await reverse_dns(flow['dstIp'])
                flow_count += 1
                insert_flow(db_conn, flow)
                await broadcast(flow)
                log.info(f'Flow: {flow["srcIp"]} ({flow["srcCity"]}) -> {flow["dstIp"]} ({flow["dstCity"]}) [{flow["protocol"]}]')

    log.info(f'Done. Parsed {packet_count} packets, {flow_count} mappable flows.')

# ── Entry point ───────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='NetGlobe WebSocket + pcap reader server')
    parser.add_argument(
        'pcap_file',
        nargs='?',
        default=str(PCAP_FILE),
        help=f'Path to pcap file (default: {PCAP_FILE})',
    )
    return parser.parse_args()


async def main(pcap_file: str):
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
        run_tshark(db_conn, asyncio.get_event_loop(), pcap_file),
    )

if __name__ == '__main__':
    args = parse_args()
    try:
        asyncio.run(main(args.pcap_file))
    except KeyboardInterrupt:
        log.info('Shutting down.')
