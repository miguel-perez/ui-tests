"""Exercise the public webhook boundary against a local recording upstream."""

import hashlib
import hmac
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
from pathlib import Path
import threading
import unittest


spec = importlib.util.spec_from_file_location("archon_webhook_proxy", Path(__file__).with_name("archon-webhook-proxy.py"))
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)
SECRET = b"test-webhook-secret-at-least-32-bytes"


class RecordingUpstream(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.server.received.append((self.path, body, dict(self.headers)))
        self.send_response(202)
        self.send_header("Content-Length", "2")
        self.end_headers()
        self.wfile.write(b"{}")


class WebhookProxyTests(unittest.TestCase):
    def setUp(self):
        self.upstream = ThreadingHTTPServer(("127.0.0.1", 0), RecordingUpstream)
        self.upstream.received = []
        self.proxy = proxy.make_server(0, self.upstream.server_port, SECRET)
        for server in (self.upstream, self.proxy):
            threading.Thread(target=server.serve_forever, daemon=True).start()

    def tearDown(self):
        for server in (self.proxy, self.upstream):
            server.shutdown()
            server.server_close()

    def request(self, method="POST", path="/webhooks/github", body=b'{"zen":"hello"}', **overrides):
        headers = {
            "Content-Type": "application/json",
            "X-Hub-Signature-256": "sha256=" + hmac.new(SECRET, body, hashlib.sha256).hexdigest(),
            "X-GitHub-Event": "ping",
            "X-GitHub-Delivery": "test-delivery",
            "Authorization": "must-not-forward",
        }
        headers.update(overrides)
        connection = http.client.HTTPConnection("127.0.0.1", self.proxy.server_port, timeout=2)
        try:
            connection.request(method, path, body, headers)
            response = connection.getresponse()
            data = response.read()
            return response.status, data
        finally:
            connection.close()

    def test_signed_payload_and_delivery_headers_forward_unchanged(self):
        body = '{"message":"signed bytes: ñ"}'.encode()
        self.assertEqual(self.request(body=body), (202, b"{}"))
        path, received, headers = self.upstream.received[0]
        self.assertEqual((path, received), ("/webhooks/github", body))
        self.assertEqual(headers["X-GitHub-Delivery"], "test-delivery")
        self.assertNotIn("Authorization", headers)

    def test_wrong_signature_never_reaches_archon(self):
        self.assertEqual(self.request(**{"X-Hub-Signature-256": "sha256=" + "0" * 64})[0], 401)
        self.assertEqual(self.upstream.received, [])

    def test_dashboard_internal_routes_queries_and_get_are_denied(self):
        for method, path in (("GET", "/"), ("POST", "/internal/git-credential"),
                             ("POST", "/webhooks/github?token=anything"), ("GET", "/webhooks/github")):
            with self.subTest(method=method, path=path):
                self.assertEqual(self.request(method, path)[0], 404)
        self.assertEqual(self.upstream.received, [])

    def test_oversized_request_rejected_before_body_read(self):
        self.assertEqual(self.request(**{"Content-Length": str(proxy.MAX_BODY + 1)})[0], 413)
        self.assertEqual(self.upstream.received, [])

    def test_chunked_and_non_json_requests_rejected(self):
        self.assertEqual(self.request(**{"Transfer-Encoding": "chunked"})[0], 400)
        self.assertEqual(self.request(**{"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.upstream.received, [])


if __name__ == "__main__":
    unittest.main()
