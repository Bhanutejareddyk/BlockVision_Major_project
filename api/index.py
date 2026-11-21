import sys
import os
from urllib.parse import urlparse

current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(current_dir, '..'))
backend_dir = os.path.join(root_dir, 'backend')

if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

# Ensure /tmp folders exist on Vercel serverless environment
if os.getenv('VERCEL') == '1' or os.path.exists('/tmp'):
    for tmp_dir in ['/tmp/uploads', '/tmp/encrypted', '/tmp/keys', '/tmp/data']:
        try:
            os.makedirs(tmp_dir, exist_ok=True)
        except Exception:
            pass

from app import app
from flask import jsonify

@app.route('/api')
@app.route('/api/')
def api_index_root():
    return jsonify({
        'status': 'healthy',
        'message': 'BlockVision 2.0 API is operational'
    })

class VercelPathMiddleware:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        # Detect true incoming URL from standard proxy headers
        req_uri = environ.get('RAW_URI') or environ.get('REQUEST_URI') or environ.get('HTTP_X_ORIGINAL_URI')
        if req_uri:
            parsed = urlparse(req_uri)
            if parsed.path.startswith('/api'):
                environ['PATH_INFO'] = parsed.path
        return self.wsgi_app(environ, start_response)

app.wsgi_app = VercelPathMiddleware(app.wsgi_app)
