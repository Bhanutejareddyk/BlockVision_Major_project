import os
import json
import hashlib
from datetime import datetime
from eth_account import Account


def _get_storage_path():
    """
    Returns storage path for email-to-wallet mapping.
    Uses /tmp/data on Vercel / serverless and backend/data locally.
    """
    if os.getenv('VERCEL') == '1' or (os.name != 'nt' and os.path.exists('/tmp')):
        data_dir = '/tmp/data'
    else:
        data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, 'email_wallets.json')


def _load_email_wallets():
    path = _get_storage_path()
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[EMAIL WALLETS] Load warning: {e}")
    return {}


def _save_email_wallets(wallets):
    path = _get_storage_path()
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(wallets, f, indent=2)
    except Exception as e:
        print(f"[EMAIL WALLETS] Save warning: {e}")


def get_or_create_wallet_for_email(email: str) -> str:
    """
    Retrieves or generates a permanent, stable Ethereum custodial address for a given email.
    Guarantees that logging in with the same email ALWAYS returns the exact same address.
    """
    clean_email = (email or '').strip().lower()
    if not clean_email:
        raise ValueError("Email cannot be empty")

    wallets = _load_email_wallets()
    if clean_email in wallets and wallets[clean_email].get('wallet_address'):
        return wallets[clean_email]['wallet_address'].lower()

    # Deterministic generation ensures mathematically persistent address even across cold serverless starts
    salt = os.getenv("SECRET_KEY", "blockvision-custodial-salt-v2")
    seed_hex = hashlib.sha256(f"email_custodial_v2:{salt}:{clean_email}".encode('utf-8')).hexdigest()
    acc = Account.from_key("0x" + seed_hex)
    wallet_addr = acc.address.lower()

    wallets[clean_email] = {
        'wallet_address': wallet_addr,
        'created_at': datetime.utcnow().isoformat()
    }
    _save_email_wallets(wallets)
    print(f"[EMAIL WALLETS] Mapped {clean_email} -> {wallet_addr}")
    return wallet_addr


def save_email_wallet(email: str, wallet_address: str):
    """Explicitly save or update an email-to-wallet mapping."""
    clean_email = (email or '').strip().lower()
    if not clean_email or not wallet_address:
        return
    wallets = _load_email_wallets()
    wallets[clean_email] = {
        'wallet_address': wallet_address.lower(),
        'updated_at': datetime.utcnow().isoformat()
    }
    _save_email_wallets(wallets)


def get_email_wallet(email: str) -> str | None:
    """Lookup existing wallet address for an email, or compute if not found."""
    clean_email = (email or '').strip().lower()
    if not clean_email:
        return None
    wallets = _load_email_wallets()
    if clean_email in wallets and wallets[clean_email].get('wallet_address'):
        return wallets[clean_email]['wallet_address'].lower()
    return get_or_create_wallet_for_email(clean_email)
