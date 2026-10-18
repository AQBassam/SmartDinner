"""Static server for dist/ that sends the same security headers as deploy/nginx.conf."""
import http.server, socketserver, sys, functools, gzip, os
CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
       "connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; "
       "frame-ancestors 'none'; object-src 'none'")
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.webmanifest': 'application/manifest+json', '.js': 'text/javascript'}
    def end_headers(self):
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        super().end_headers()
    def log_message(self, *a): pass
    def send_head(self):
        # gzip text assets like the production nginx (gzip_types css/js/json/svg/manifest)
        path = self.translate_path(self.path.split('?')[0])
        if os.path.isdir(path): path = os.path.join(path, 'index.html')
        if (os.path.isfile(path) and 'gzip' in self.headers.get('Accept-Encoding', '')
                and path.endswith(('.js', '.css', '.json', '.svg', '.webmanifest', '.html'))):
            body = gzip.compress(open(path, 'rb').read(), 6)
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(path)); self.send_header('Content-Encoding', 'gzip')
            self.send_header('Content-Length', str(len(body))); self.end_headers()
            import io; return io.BytesIO(body)
        return super().send_head()
socketserver.TCPServer.allow_reuse_address = True
port = int(sys.argv[2]) if len(sys.argv) > 2 else 4173
with socketserver.TCPServer(('127.0.0.1', port), functools.partial(H, directory=sys.argv[1])) as s:
    s.serve_forever()
