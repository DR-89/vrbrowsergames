from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy','same-origin')
        self.send_header('Cross-Origin-Embedder-Policy','require-corp')
        self.send_header('Cross-Origin-Resource-Policy','same-origin')
        self.send_header('Permissions-Policy','xr-spatial-tracking=(self)')
        self.send_header('Cache-Control','no-cache')
        super().end_headers()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8094);a=p.parse_args()
    folder=Path(__file__).resolve().parents[1]/'dist'
    print(f'WebXR arcade: http://localhost:{a.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',a.port),lambda *x,**k:Handler(*x,directory=str(folder),**k)).serve_forever()
