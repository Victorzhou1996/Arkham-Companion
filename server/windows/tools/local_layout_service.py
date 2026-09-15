"""Local account layout endpoint. Python stdlib only; no public listening port."""
import argparse
import http.client
import json
import signal
import socketserver
import sqlite3
from contextlib import closing
from http.server import BaseHTTPRequestHandler
from pathlib import Path

from layout_preferences import LayoutStore, validate_patch

ENDPOINT = '/api/v1/account/tabletop-layout'


def account_for_token(port, token):
    if not token.startswith('Token ') or len(token) > 8192:
        return None
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        connection.request('GET', '/api/v1/whoami', headers={'Authorization': token})
        response = connection.getresponse()
        if response.status != 200:
            return None
        user = json.loads(response.read(65536))
        # Full normalized email is collision-free and stable across save restores.
        email = user.get('email')
        return email.strip().lower() if isinstance(email, str) and email.strip() else None
    finally:
        connection.close()


class LocalStore(LayoutStore):
    def access(self, user_id, patch=None):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.path, timeout=5)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS local_layouts (account TEXT PRIMARY KEY, panels TEXT NOT NULL)')
            if patch is not None:
                patch = validate_patch(patch)
                db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT panels FROM local_layouts WHERE account=?', (user_id,)).fetchone()
            panels = validate_patch(json.loads(row[0])) if row else {}
            if patch:
                panels.update(patch)
                db.execute('INSERT INTO local_layouts VALUES (?,?) ON CONFLICT(account) DO UPDATE SET panels=excluded.panels',
                           (user_id, json.dumps(panels, separators=(',', ':'))))
            return {'version': 1, 'panels': panels}


def make_handler(store, api_port):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_args):
            pass  # Never log credentials; do not write per-request idle logs.

        def respond(self, status, payload):
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self.dispatch()

        def do_PUT(self):
            self.dispatch()

        def dispatch(self):
            if self.path != ENDPOINT:
                return self.respond(404, {'error': 'Not found'})
            try:
                account = account_for_token(api_port, self.headers.get('Authorization', ''))
                if account is None:
                    return self.respond(401, {'error': 'Authentication required'})
                patch = None
                if self.command == 'PUT':
                    size = int(self.headers.get('Content-Length', '0'))
                    if size < 1 or size > 8192 or self.headers.get('Transfer-Encoding'):
                        return self.respond(413, {'error': 'Invalid body size'})
                    patch = validate_patch(json.loads(self.rfile.read(size)))
                self.respond(200, store.access(account, patch))
            except (ValueError, TypeError, UnicodeError):
                self.respond(400, {'error': 'Invalid layout preferences'})
            except (OSError, http.client.HTTPException, sqlite3.Error):
                self.respond(503, {'error': 'Local preferences temporarily unavailable'})
    return Handler


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--socket', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--api-port', required=True, type=int)
    args = parser.parse_args()
    sock = Path(args.socket)
    # Parent directory is on the WSL filesystem, never the Windows package drive.
    sock.parent.mkdir(parents=True, exist_ok=True)
    server = Server(str(sock), make_handler(LocalStore(args.database), args.api_port))
    sock.chmod(0o600)
    signal.signal(signal.SIGTERM, lambda *_args: (_ for _ in ()).throw(SystemExit(0)))
    try:
        server.serve_forever(poll_interval=2)
    finally:
        server.server_close()
        sock.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
