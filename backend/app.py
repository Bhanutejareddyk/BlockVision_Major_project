import os
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
from config import Config
from routes.upload import upload_bp
from routes.verify import verify_bp
from routes.history import history_bp
from utils.cleanup import FileCleanup

# Resolve frontend directory path safely
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))

# Create Flask app
app = Flask(
    __name__, 
    static_folder=FRONTEND_DIR,
    template_folder=FRONTEND_DIR
)

# Load configuration
app.config.from_object(Config)
Config.init_app(app)
app.config['MAX_CONTENT_LENGTH'] = Config.MAX_FILE_SIZE

# Enable CORS
CORS(app)

# Run cleanup on startup
print(f"\n{'='*60}")
print(f"[CLEANUP] Checking for files older than {Config.RETENTION_DAYS} days...")
print(f"{'='*60}")
FileCleanup.cleanup_old_files()
print(f"{'='*60}\n")

# Register blueprints
app.register_blueprint(upload_bp)
app.register_blueprint(verify_bp)
app.register_blueprint(history_bp)


# Frontend Page Routes
@app.route('/')
def index():
    """Serve landing page"""
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/upload')
def upload_page():
    """Serve upload page"""
    return send_from_directory(app.static_folder, 'upload.html')


@app.route('/verify')
def verify_page():
    """Serve verify page"""
    return send_from_directory(app.static_folder, 'verify.html')


@app.route('/history')
def history_page():
    """Serve history page"""
    return send_from_directory(app.static_folder, 'history.html')


# Static asset routes
@app.route('/css/<path:filename>')
def serve_css(filename):
    """Serve CSS files"""
    return send_from_directory(os.path.join(app.static_folder, 'css'), filename)


@app.route('/js/<path:filename>')
def serve_js(filename):
    """Serve JavaScript files"""
    return send_from_directory(os.path.join(app.static_folder, 'js'), filename)


@app.route('/assets/<path:filename>')
def serve_assets(filename):
    """Serve asset files"""
    return send_from_directory(os.path.join(app.static_folder, 'assets'), filename)


# Error handlers
@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({'error': 'Resource not found'}), 404


@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle 413 file size exceeded errors"""
    return jsonify({'error': 'File too large. Maximum size is 16MB.'}), 413


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500


# Health check endpoint
@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'message': 'Blockchain Image Verification System is running',
        'contract_address': Config.CONTRACT_ADDRESS or 'Not deployed'
    }), 200


# Serve uploaded images by hash
@app.route('/api/image/<image_hash>')
def serve_image(image_hash):
    """Serve uploaded images by hash"""
    try:
        upload_dir = Config.UPLOAD_FOLDER
        extensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp']
        
        # Check standard extensions
        for ext in extensions:
            filename = f"{image_hash}{ext}"
            file_path = os.path.join(upload_dir, filename)
            if os.path.exists(file_path):
                return send_from_directory(upload_dir, filename)
        
        # Fallback search if hash prefix matches
        if os.path.exists(upload_dir):
            for filename in os.listdir(upload_dir):
                if filename.startswith(image_hash):
                    return send_from_directory(upload_dir, filename)
        
        return jsonify({'error': 'Image not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Manual cleanup endpoint
@app.route('/api/cleanup', methods=['POST'])
def manual_cleanup():
    """Manually trigger cleanup of expired files"""
    try:
        deleted_count = FileCleanup.cleanup_old_files()
        return jsonify({
            'success': True,
            'message': 'Cleanup completed',
            'files_deleted': deleted_count,
            'retention_days': Config.RETENTION_DAYS
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = Config.FLASK_PORT
    is_debug = Config.FLASK_ENV == 'development'
    print(f"Starting BlockVision Flask server on http://127.0.0.1:{port} (debug={is_debug})")
    app.run(
        host='0.0.0.0',
        port=port,
        debug=is_debug
    )
