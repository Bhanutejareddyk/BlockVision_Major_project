import os
from dotenv import load_dotenv

# Paths
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BACKEND_DIR)
BACKEND_ENV = os.path.join(BACKEND_DIR, '.env')
ROOT_ENV = os.path.join(ROOT_DIR, '.env')

def load_app_env():
    """Load environment variables from backend/.env or root .env"""
    if os.path.exists(BACKEND_ENV):
        load_dotenv(BACKEND_ENV, override=True)
    elif os.path.exists(ROOT_ENV):
        load_dotenv(ROOT_ENV, override=True)
    else:
        load_dotenv()

# Initial load
load_app_env()


class ConfigMeta(type):
    """Metaclass allowing dynamic, lazy property lookups for Config class"""
    
    @property
    def CONTRACT_ADDRESS(cls):
        load_app_env()
        return os.getenv('CONTRACT_ADDRESS', '')
    
    @property
    def PRIVATE_KEY(cls):
        load_app_env()
        return os.getenv('PRIVATE_KEY', '')
    
    @property
    def ETHEREUM_NODE_URL(cls):
        load_app_env()
        return os.getenv('ETHEREUM_NODE_URL', 'http://127.0.0.1:7545')
    
    @property
    def NETWORK_ID(cls):
        load_app_env()
        return int(os.getenv('NETWORK_ID', 5777))
    
    @property
    def FLASK_PORT(cls):
        load_app_env()
        return int(os.getenv('FLASK_PORT', 5000))


class Config(metaclass=ConfigMeta):
    """Application configuration with dynamic environment reloading"""
    
    # Flask Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-blockvision-2.0')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    
    # Upload Configuration
    UPLOAD_FOLDER = '/tmp/uploads' if os.environ.get('VERCEL') == '1' else os.path.join(BACKEND_DIR, os.getenv('UPLOAD_FOLDER', 'uploads'))
    ENCRYPTED_FOLDER = '/tmp/encrypted' if os.environ.get('VERCEL') == '1' else os.path.join(BACKEND_DIR, os.getenv('ENCRYPTED_FOLDER', 'encrypted'))
    KEYS_FOLDER = '/tmp/keys' if os.environ.get('VERCEL') == '1' else os.path.join(BACKEND_DIR, os.getenv('KEYS_FOLDER', 'keys'))
    MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', 16777216))  # 16MB
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
    
    # Retention Configuration
    RETENTION_DAYS = int(os.getenv('RETENTION_DAYS', 30))  # Delete images after 30 days
    
    @classmethod
    def reload(cls):
        """Force reload environment variables"""
        load_app_env()
    
    @classmethod
    def get_contract_address(cls):
        load_app_env()
        return os.getenv('CONTRACT_ADDRESS', '')
    
    @staticmethod
    def init_app(app):
        """Initialize application directories and configuration"""
        load_app_env()
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(Config.ENCRYPTED_FOLDER, exist_ok=True)
        os.makedirs(Config.KEYS_FOLDER, exist_ok=True)
        app.config['MAX_CONTENT_LENGTH'] = Config.MAX_FILE_SIZE
        app.config['UPLOAD_FOLDER'] = Config.UPLOAD_FOLDER
