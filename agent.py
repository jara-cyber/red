"""RED: Windows LAN inventory and authenticated local PWA server."""
import argparse
import base64
import concurrent.futures
import hmac
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
LOCK = threading.RLock()
STATUS = {'ready': False, 'error': None, 'network': None, 'devices': [], 'events': [], 'updated': None}


def read_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def save_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, path)


def ps(script):
    # Windows PowerShell 5.1: encoded UTF-16LE script, JSON output in UTF-8.
    script = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; " + script
    result = subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand',
                             base64.b64encode(script.encode('utf-16le')).decode()],
                            capture_output=True, timeout=35, check=True)
    return json.loads(result.stdout.decode('utf-8-sig'))


def network_info(interface=None):
    index_filter = f' -InterfaceIndex {int(interface)}' if interface else ''
    return ps("$cs = @(Get-NetIPConfiguration" + index_filter + "); "
              "$rows = @($cs | Where-Object {$_.IPv4DefaultGateway -and $_.IPv4Address} | ForEach-Object { "
              "$c=$_; $a=@($c.IPv4Address)[0]; "
              "$r=Get-NetIPInterface -InterfaceIndex $c.InterfaceIndex -AddressFamily IPv4; "
              "[pscustomobject]@{ interface=$c.InterfaceAlias; index=$c.InterfaceIndex; ip=$a.IPAddress; "
              "prefix=$a.PrefixLength; gateway=@($c.IPv4DefaultGateway)[0].NextHop; "
              "dns=@($c.DNSServer | ForEach-Object {$_.ServerAddresses}); metric=$r.InterfaceMetric; "
              "mac=(Get-NetAdapter -InterfaceIndex $c.InterfaceIndex).MacAddress } }); "
              "$best=$rows | Sort-Object metric | Select-Object -First 1; "
              "if (!$best) {throw 'No hay interfaz IPv4 con puerta de enlace'}; $best | ConvertTo-Json -Depth 5")


def probe_targets(network):
    subnet = ipaddress.ip_network(f"{network['ip']}/{network['prefix']}", strict=False)
    # Never silently scan a /16 or truncate it to an invented /24.
    if subnet.version != 4 or subnet.num_addresses > 256 or not subnet.is_private:
        raise ValueError('Sondeo limitado a una subred IPv4 privada /24 o menor. Usa modo pasivo para esta red.')
    return [str(ip) for ip in subnet.hosts() if str(ip) != network['ip']]


def ping(ip):
    try:
        subprocess.run(['ping.exe', '-n', '1', '-w', '350', ip], stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL, timeout=3)
    except subprocess.TimeoutExpired:
        pass


def neighbors(network):
    rows = ps(f"@(Get-NetNeighbor -InterfaceIndex {int(network['index'])} -AddressFamily IPv4 | "
              "Select-Object IPAddress,LinkLayerAddress,State) | ConvertTo-Json -Compress")
    if rows is None:
        rows = []
    if isinstance(rows, dict):
        rows = [rows]
    subnet = ipaddress.ip_network(f"{network['ip']}/{network['prefix']}", strict=False)
    devices = []
    for row in rows:
        mac = str(row.get('LinkLayerAddress', '')).replace('-', ':').lower()
        try:
            ip = ipaddress.ip_address(row['IPAddress'])
        except ValueError:
            continue
        # Stale entries are retained in the history, never treated as a fresh sighting.
        if (ip not in subnet or row.get('State') not in ('Reachable', 'Permanent', 'Delay', 'Probe')
                or not re.fullmatch(r'(?:[0-9a-f]{2}:){5}[0-9a-f]{2}', mac)
                or mac == '00:00:00:00:00:00' or int(mac[:2], 16) & 1):
            continue
        devices.append({'ip': str(ip), 'mac': mac, 'role': 'Gateway' if str(ip) == network['gateway'] else 'Dispositivo'})
    own_mac = str(network['mac']).replace('-', ':').lower()
    if re.fullmatch(r'(?:[0-9a-f]{2}:){5}[0-9a-f]{2}', own_mac):
        devices.append({'ip': network['ip'], 'mac': own_mac, 'role': 'Este Windows'})
    return devices


def reconcile(store, network, devices, now):
    subnet = str(ipaddress.ip_network(f"{network['ip']}/{network['prefix']}", strict=False))
    gateway_device = next((d for d in devices if d['ip'] == network['gateway']), None)
    gateway_mac = gateway_device['mac'] if gateway_device else None
    # A known gateway MAC distinguishes networks which reuse the same IPv4 range.
    base = f"{network['mac']}|{subnet}|{network['gateway']}"
    key = base + '|' + (gateway_mac or 'unknown')
    if not gateway_mac:
        candidates = [k for k in store if k.startswith(base + '|')]
        if len(candidates) == 1:
            key = candidates[0]
    elif key not in store and base + '|unknown' in store:
        store[key] = store.pop(base + '|unknown')
    first = key not in store
    records = store.setdefault(key, {})
    events = []
    for device in devices:
        mac = device['mac']
        if mac not in records:
            records[mac] = {**device, 'first_seen': now, 'last_seen': now}
            if not first:
                events.append({'id': secrets.token_hex(8), 'at': now, 'ip': device['ip'], 'mac': mac,
                               'message': 'Dispositivo detectado por primera vez'})
        records[mac].update(device, last_seen=now)
    result = [{**d, 'recent': now - d['last_seen'] < 180} for d in records.values()]
    return sorted(result, key=lambda d: ipaddress.ip_address(d['ip'])), events


def valid_subscription(value):
    if not isinstance(value, dict) or not isinstance(value.get('endpoint'), str):
        return False
    u = urlparse(value['endpoint'])
    allowed = ('fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com')
    keys = value.get('keys', {})
    try:
        return (u.scheme == 'https' and u.hostname in allowed and u.port in (None, 443)
                and not u.username and not u.password and len(value['endpoint']) < 4096
                and isinstance(keys, dict) and all(isinstance(keys.get(k), str) and
                    re.fullmatch(r'[A-Za-z0-9_-]{16,200}={0,2}', keys[k]) for k in ('auth', 'p256dh')))
    except ValueError:
        return False


def push_config():
    if not (DATA / 'vapid-private.pem').exists():
        return None
    return read_json(DATA / 'vapid.json', None)


def send_push(events, target=None):
    config = push_config()
    if not config or not events:
        return
    from pywebpush import webpush, WebPushException
    with LOCK:
        subscriptions = read_json(DATA / 'subscriptions.json', [])
        if target is not None:
            subscriptions = [s for s in subscriptions if s['endpoint'] == target]
    expired = []
    # Generic lock-screen message keeps network addresses out of push payloads.
    for sub in subscriptions:
        if not valid_subscription(sub):
            continue
        try:
            webpush(subscription_info=sub, data=json.dumps({'title': 'RED · Nuevo dispositivo',
                    'body': 'Prueba de notificaciones RED.' if events[0].get('test') else f'{len(events)} dispositivo(s) detectado(s) por primera vez. Abre el panel.'}),
                    vapid_private_key=str(DATA / 'vapid-private.pem'),
                    vapid_claims={'sub': config['subject']}, timeout=10, ttl=300)
        except WebPushException as exc:
            if exc.response is not None and exc.response.status_code in (404, 410):
                expired.append(sub['endpoint'])
            else:
                print('No se pudo entregar un aviso push; revisa la conectividad del agente.')
        except Exception:
            print('Error al enviar push; la detección continúa.')
    if expired:
        with LOCK:
            current = read_json(DATA / 'subscriptions.json', [])
            save_json(DATA / 'subscriptions.json', [s for s in current if s['endpoint'] not in expired])


def monitor(args, stop):
    # Fail closed if persistence is corrupt; do not reset the baseline silently.
    try:
        store = read_json(DATA / 'inventory.json', {})
        history = read_json(DATA / 'events.json', [])
    except (ValueError, OSError):
        with LOCK:
            STATUS['error'] = 'No se puede leer el historial local. Conserva data/ y revisa sus archivos.'
        return
    while not stop.is_set():
        try:
            net = network_info(args.interface)
            net['subnet'] = str(ipaddress.ip_network(f"{net['ip']}/{net['prefix']}", strict=False))
            if args.probe:
                with concurrent.futures.ThreadPoolExecutor(max_workers=24) as pool:
                    list(pool.map(ping, probe_targets(net)))
            devices, events = reconcile(store, net, neighbors(net), time.time())
            history = (events + history)[:200]
            with LOCK:
                save_json(DATA / 'inventory.json', store)
                save_json(DATA / 'events.json', history)
                STATUS.update(ready=True, error=None, network=net, devices=devices,
                              events=history, updated=time.time(), mode='Sondeo IPv4' if args.probe else 'Pasivo')
            send_push(events)
        except Exception as exc:
            with LOCK:
                STATUS['error'] = str(exc) if isinstance(exc, ValueError) else 'No se ha podido leer la red de Windows. Comprueba la conexión y la consola.'
            print('Lectura de red fallida:', type(exc).__name__)
        stop.wait(args.interval)


def make_handler(token, port):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log auth headers, subscriptions or query strings.

        def reply(self, code, value, mime='application/json; charset=utf-8'):
            body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            return hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token)

        def good_host(self):
            # Blocks DNS rebinding; optional HTTPS reverse-proxy hostname is explicit.
            allowed = {f'localhost:{port}', f'127.0.0.1:{port}'}
            public = os.environ.get('RED_PUBLIC_ORIGIN', '')
            if public:
                allowed.add(urlparse(public).netloc)
            return self.headers.get('Host') in allowed

        def do_GET(self):
            if not self.good_host():
                return self.reply(403, {'error': 'Host no permitido'})
            if self.path == '/api/status':
                if not self.authorized():
                    return self.reply(401, {'error': 'Clave incorrecta'})
                with LOCK:
                    return self.reply(200, {**STATUS, 'push': push_config() is not None})
            if self.path == '/api/push-key':
                if not self.authorized():
                    return self.reply(401, {'error': 'Clave incorrecta'})
                config = push_config()
                return self.reply(200, {'publicKey': config['publicKey'] if config else None})
            files = {'/': ('index.html', 'text/html; charset=utf-8'),
                     '/app.js': ('app.js', 'text/javascript; charset=utf-8'),
                     '/style.css': ('style.css', 'text/css; charset=utf-8'),
                     '/sw.js': ('sw.js', 'text/javascript; charset=utf-8'),
                     '/manifest.webmanifest': ('manifest.webmanifest', 'application/manifest+json'),
                     '/icon.svg': ('icon.svg', 'image/svg+xml'),
                     '/icon-192.png': ('icon-192.png', 'image/png'),
                     '/icon-512.png': ('icon-512.png', 'image/png')}
            file = files.get(self.path)
            if not file:
                return self.reply(404, {'error': 'No encontrado'})
            return self.reply(200, (ROOT / 'web' / file[0]).read_bytes(), file[1])

        def do_POST(self):
            if not self.good_host():
                return self.reply(403, {'error': 'Host no permitido'})
            if not self.authorized():
                return self.reply(401, {'error': 'Clave incorrecta'})
            if self.path not in ('/api/subscribe', '/api/unsubscribe', '/api/test-push'):
                return self.reply(404, {'error': 'No encontrado'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if size < 2 or size > 8192:
                    raise ValueError()
                value = json.loads(self.rfile.read(size))
                if not valid_subscription(value):
                    raise ValueError()
            except (ValueError, TypeError):
                return self.reply(400, {'error': 'Suscripción inválida o proveedor push no compatible'})
            if self.path == '/api/test-push':
                # Test through the standard sender, using saved subscribers only.
                threading.Thread(target=send_push, args=([{'test': True}], value['endpoint']), daemon=True).start()
                return self.reply(202, {'ok': True})
            with LOCK:
                subs = read_json(DATA / 'subscriptions.json', [])
                subs = [s for s in subs if s['endpoint'] != value['endpoint']]
                if self.path == '/api/subscribe':
                    if len(subs) >= 20:
                        return self.reply(409, {'error': 'Máximo 20 suscripciones'})
                    subs.append(value)
                save_json(DATA / 'subscriptions.json', subs)
            self.reply(200, {'ok': True})
    return Handler


def init_push(subject):
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    if not subject.startswith('mailto:') or '@' not in subject:
        raise ValueError('Usa --init-push mailto:tu-correo@dominio.com')
    if (DATA / 'vapid-private.pem').exists():
        print('Ya existen claves push. Se conservan.')
        return
    key = ec.generate_private_key(ec.SECP256R1())
    (DATA / 'vapid-private.pem').write_bytes(key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    save_json(DATA / 'vapid.json', {'subject': subject, 'publicKey': base64.urlsafe_b64encode(public).rstrip(b'=').decode()})
    print('Claves push creadas. Conserva data/ en privado.')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--port', type=int, default=8765)
    p.add_argument('--interval', type=int, default=30)
    p.add_argument('--interface', type=int, help='Índice de interfaz Windows para evitar VPN/adaptadores virtuales')
    p.add_argument('--probe', action='store_true', help='Enviar ping a la subred privada /24 o menor')
    p.add_argument('--init-push', metavar='MAILTO')
    args = p.parse_args()
    DATA.mkdir(exist_ok=True)
    if args.init_push:
        init_push(args.init_push)
        return
    if os.name != 'nt':
        p.error('El agente requiere Windows 10/11 y Windows PowerShell 5.1.')
    if args.interval < 15:
        p.error('El intervalo mínimo es 15 segundos.')
    token_file = DATA / 'token.txt'
    if not token_file.exists():
        token_file.write_text(secrets.token_urlsafe(32), encoding='utf-8')
    token = token_file.read_text(encoding='utf-8').strip()
    print(f'Panel: http://localhost:{args.port}\nClave de acceso: {token}\nMantén esta ventana abierta. Ctrl+C para detener.')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(token, args.port))
    stop = threading.Event()
    worker = threading.Thread(target=monitor, args=(args, stop), daemon=True)
    worker.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop.set()
        server.server_close()


if __name__ == '__main__':
    main()
