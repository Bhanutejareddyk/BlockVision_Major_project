import os
import time
import secrets
import datetime
import jwt
from eth_account import Account
from eth_account.messages import encode_defunct
from functools import wraps
from flask import request, jsonify, g

# In-memory store for nonces: {wallet_lower: {"nonce": nonce, "expires_at": timestamp}}
_nonces = {}

NONCE_EXPIRY_SECONDS = 300  # 5 minutes
TOKEN_EXPIRY_HOURS = 24

def get_secret_key():
    return os.getenv("SECRET_KEY", "dev-secret-key-blockvision-2.0")

def generate_nonce(wallet_address: str) -> str:
    """Generate a random 32-character nonce string and store with 5-minute expiry."""
    if not wallet_address:
        raise ValueError("Wallet address is required")
    
    clean_addr = wallet_address.strip().lower()
    nonce = secrets.token_hex(16)  # 32 hex chars
    expires_at = time.time() + NONCE_EXPIRY_SECONDS
    
    _nonces[clean_addr] = {
        "nonce": nonce,
        "expires_at": expires_at
    }
    return nonce

def get_expected_message(wallet_address: str, nonce: str) -> str:
    """Return standard sign-in challenge message."""
    return f"Login to BlockVision-2.0\nNonce: {nonce}\nAddress: {wallet_address.strip()}"

def verify_signature(wallet_address: str, nonce: str, signature: str) -> bool:
    """Verify MetaMask personal_sign cryptographic signature against stored nonce."""
    if not wallet_address or not nonce or not signature:
        return False
    
    clean_addr = wallet_address.strip().lower()
    record = _nonces.get(clean_addr)
    
    if not record:
        return False
    
    # Check expiry
    if time.time() > record["expires_at"]:
        _nonces.pop(clean_addr, None)
        return False
    
    # Check nonce match
    if record["nonce"] != nonce:
        return False
    
    try:
        # Form message exactly matching challenge
        challenge_msg = get_expected_message(wallet_address, nonce)
        signable_msg = encode_defunct(text=challenge_msg)
        recovered_address = Account.recover_message(signable_msg, signature=signature)
        
        is_valid = recovered_address.lower() == clean_addr
        if is_valid:
            # Delete nonce to prevent replay
            _nonces.pop(clean_addr, None)
        return is_valid
    except Exception as e:
        print(f"Signature verification error: {e}")
        return False

def create_session_token(wallet_address: str, login_type: str = "metamask", guest_id: str = None) -> str:
    """Create a 24-hour JWT session token for authenticated wallet address."""
    clean_addr = wallet_address.strip().lower()
    secret = get_secret_key()
    
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "wallet": clean_addr,
        "wallet_address": clean_addr,
        "loginType": login_type,
        "iat": now,
        "exp": now + datetime.timedelta(hours=TOKEN_EXPIRY_HOURS)
    }
    if guest_id:
        payload["guestId"] = guest_id.strip().upper()
    
    token = jwt.encode(payload, secret, algorithm="HS256")
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token

def decode_session_token(token: str):
    """Decode and validate session token payload."""
    if not token:
        return None
    
    secret = get_secret_key()
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def verify_session_token(token: str):
    """Verify JWT session token and return wallet address, or None if invalid/expired."""
    payload = decode_session_token(token)
    if payload:
        return payload.get("wallet")
    return None


def require_auth(f):
    """
    Decorator for routes requiring user authentication via JWT bearer token.
    Populates Flask's g.wallet_address, g.login_type, and g.guest_id.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({
                "success": False,
                "error": "Authentication required. Please connect wallet or continue as guest."
            }), 401
        
        token = auth_header.split(" ", 1)[1].strip()
        payload = decode_session_token(token)
        if not payload or not payload.get("wallet"):
            return jsonify({
                "success": False,
                "error": "Invalid or expired session token. Please sign in again."
            }), 401
        
        g.wallet_address = payload.get("wallet") or payload.get("wallet_address")
        g.login_type = payload.get("loginType", "metamask")
        g.guest_id = payload.get("guestId")
        return f(*args, **kwargs)
    return decorated_function
