import http.client
import json
import socket
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, sys.argv.pop(1))
from local_layout_service import ENDPOINT, LocalStore, Server, make_handler


class FakeAuth(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        users = {'Token a': 'A@example.test', 'Token b': 'b@example.test'}
        email = users.get(self.headers.get('Authorization'))
        self.send_response(200 if email and self.path == '/api/v1/whoami' else 401)
        self.end_headers()
        self.wfile.write(json.dumps({'email': email}).encode())


class LocalTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name)
        self.auth = ThreadingHTTPServer(('127.0.0.1', 0), FakeAuth)
        self.store = LocalStore(self.path / 'prefs.sqlite3')
        self.server = Server(str(self.path / 'prefs.sock'), make_handler(self.store, self.auth.server_port))
        for server in (self.auth, self.server):
            threading.Thread(target=server.serve_forever, daemon=True).start()

    def tearDown(self):
        for server in (self.server, self.auth):
            server.shutdown()
            server.server_close()
        self.folder.cleanup()

    def request(self, method='GET', token='Token a', body=None, path=ENDPOINT):
        connection = http.client.HTTPConnection('localhost', timeout=3)
        connection.sock = socket.socket(socket.AF_UNIX)
        connection.sock.connect(str(self.path / 'prefs.sock'))
        try:
            connection.request(method, path, body, {'Authorization': token})
            response = connection.getresponse()
            return response.status, json.loads(response.read()), response.headers
        finally:
            connection.close()

    def test_account_isolation_merge_restart(self):
        self.assertEqual(self.request()[1]['panels'], {})
        self.assertEqual(self.request('PUT', body='{"left":25,"log":4}')[0], 200)
        self.assertEqual(self.request('PUT', body='{"hand":62}')[0], 200)
        self.assertEqual(self.request(token='Token b')[1]['panels'], {})
        self.assertEqual(LocalStore(self.store.path).access('a@example.test')['panels'], {'left':25,'log':4,'hand':62})
        self.assertEqual(self.request()[2]['Cache-Control'], 'no-store')

    def test_authentication_and_unknown_path(self):
        for token in ('', 'Token deleted', 'Bearer a'):
            self.assertEqual(self.request(token=token)[0], 401)
        self.assertEqual(self.request(path='/anything')[0], 404)

    def test_validation_and_four_pile_exception(self):
        for body in ('{"piles":70}', '{"pileRows":30}', '{"userId":2}', '[]', '{"left":true}', '{"left":NaN}', 'broken'):
            self.assertEqual(self.request('PUT', body=body)[0], 400)
        self.assertEqual(self.request('PUT', body='x'*8193)[0], 413)
        self.assertEqual(self.request('PUT', body='{"left":999,"log":-1}')[1]['panels'], {'left':32,'log':0})


unittest.main()
