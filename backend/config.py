import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Application configuration"""
    
    # Flask Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')
    
    # Upload Configuration
    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), os.getenv('UPLOAD_FOLDER', 'uploads'))
    ENCRYPTED_FOLDER = os.path.join(os.path.dirname(__file__), os.getenv('ENCRYPTED_FOLDER', 'encrypted'))
    KEYS_FOLDER = os.path.join(os.path.dirname(__file__), os.getenv('KEYS_FOLDER', 'keys'))
    MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', 16777216))  # 16MB
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
    
    # Retention Configuration
    RETENTION_DAYS = int(os.getenv('RETENTION_DAYS', 30))  # Delete images after 30 days
    
    # Blockchain Configuration
    ETHEREUM_NODE_URL = os.getenv('ETHEREUM_NODE_URL', 'http://127.0.0.1:7545')
    CONTRACT_ADDRESS = os.getenv('CONTRACT_ADDRESS', '')
    PRIVATE_KEY = os.getenv('PRIVATE_KEY', '')
    NETWORK_ID = int(os.getenv('NETWORK_ID', 5777))
    
    @staticmethod
    def init_app(app):
        """Initialize application with configuration"""
        # Create necessary directories
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(Config.ENCRYPTED_FOLDER, exist_ok=True)
        os.makedirs(Config.KEYS_FOLDER, exist_ok=True)
