#!/usr/bin/env python3
"""Serves the repo for the manual checks in test/edge-cases.html, with failing and slow stylesheets."""
import http.server
import time

HTML_LOGIN = b'<!DOCTYPE html><html><body>Please log in</body></html>'
SLOW_CSS = b'.slow-sheet { color: rgb(1, 2, 3); }'


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/fixture/login.css'):
            self.reply(200, 'text/html', HTML_LOGIN)
        elif self.path.startswith('/fixture/slow.css'):
            time.sleep(6)
            self.reply(200, 'text/css', SLOW_CSS)
        else:
            super().do_GET()

    def reply(self, status, content_type, body):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


http.server.ThreadingHTTPServer(('0.0.0.0', 8123), Handler).serve_forever()
