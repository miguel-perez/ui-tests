#!/usr/bin/env python3
"""Expose only signed GitHub webhook deliveries to the local Archon server."""

import argparse
import hashlib
import hmac
import http.client
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MAX_BODY = 2 * 1024 * 1024


class BoundedHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, *args, **kwargs):
        self.slots = threading.BoundedSemaphore(16)
        super().__init__(*args, **kwargs)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class WebhookHandler(BaseHTTPRequestHandler):
    server_version = "WebhookProxy"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(20)

    def log_message(self, *_args):
        pass  # Delivery contents, request headers, and credentials stay out of logs.

    def reject(self, status):
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def do_POST(self):
        if self.path != "/webhooks/github":
            return self.reject(404)
        if self.headers.get("Transfer-Encoding"):
            return self.reject(400)
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not re.fullmatch(r"[0-9]+", lengths[0]):
            return self.reject(411)
        length = int(lengths[0])
        if not 0 < length <= MAX_BODY:
            return self.reject(413)
        if self.headers.get("Content-Type", "").split(";", 1)[0].lower() != "application/json":
            return self.reject(415)
        signatures = self.headers.get_all("X-Hub-Signature-256", [])
        if len(signatures) != 1 or not re.fullmatch(r"sha256=[a-f0-9]{64}", signatures[0]):
            return self.reject(401)
        try:
            body = self.rfile.read(length)
        except (TimeoutError, OSError):
            return self.reject(408)
        if len(body) != length:
            return self.reject(400)
        expected = "sha256=" + hmac.new(self.server.webhook_secret, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signatures[0], expected):
            return self.reject(401)
        headers = {"Content-Type": "application/json", "X-Hub-Signature-256": signatures[0]}
        for name in ("X-GitHub-Event", "X-GitHub-Delivery", "X-GitHub-Hook-ID"):
            if name in self.headers:
                headers[name] = self.headers[name]
        connection = http.client.HTTPConnection("127.0.0.1", self.server.upstream_port, timeout=30)
        try:
            connection.request("POST", "/webhooks/github", body, headers)
            response = connection.getresponse()
            data = response.read(1024 * 1024 + 1)
            if len(data) > 1024 * 1024:
                return self.reject(502)
            self.send_response(response.status)
            self.send_header("Content-Type", response.getheader("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (OSError, http.client.HTTPException):
            self.reject(502)
        finally:
            connection.close()

    def do_GET(self):
        self.reject(404)

    do_HEAD = do_GET
    do_PUT = do_GET
    do_PATCH = do_GET
    do_DELETE = do_GET
    do_OPTIONS = do_GET
    do_CONNECT = do_GET


def make_server(port, upstream_port, secret):
    server = BoundedHTTPServer(("127.0.0.1", port), WebhookHandler)
    server.upstream_port = upstream_port
    server.webhook_secret = secret
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3091)
    parser.add_argument("--upstream-port", type=int, default=3090)
    parser.add_argument("--secret-file", type=Path, required=True)
    args = parser.parse_args()
    secret = args.secret_file.read_bytes().strip()
    if len(secret) < 32:
        parser.error("Webhook secret must contain at least 32 bytes")
    with make_server(args.port, args.upstream_port, secret) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
