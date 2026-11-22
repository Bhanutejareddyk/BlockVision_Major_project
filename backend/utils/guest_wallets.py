import os
import json
import secrets
import hashlib
import hmac
from datetime import datetime
from eth_account import Account

GUEST_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 32 characters, no ambiguous 0, O, 1, I


def _get_guest_storage_path():
    """
    Returns storage path for guest-to-wallet mapping.
    Uses /tmp/data on Vercel / serverless and backend/data locally.
    """
    if os.getenv('VERCEL') == '1' or (os.name != 'nt' and os.path.exists('/tmp')):
        data_dir = '/tmp/data'
    else:
        data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, 'guest_wallets.json')


def _load_guest_wallets():
    path = _get_guest_storage_path()
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[GUEST WALLETS] Load warning: {e}")
    return {}


def _save_guest_wallets(wallets):
    path = _get_guest_storage_path()
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(wallets, f, indent=2)
    except Exception as e:
        print(f"[GUEST WALLETS] Save warning: {e}")


def _compute_checksum(base4: str, salt: str) -> str:
    digest = hmac.new(salt.encode('utf-8'), f"guest_code:{base4}".encode('utf-8'), hashlib.sha256).digest()
    c1 = GUEST_CHARS[digest[0] % len(GUEST_CHARS)]
    c2 = GUEST_CHARS[digest[1] % len(GUEST_CHARS)]
    return f"{c1}{c2}"


def generate_guest_id() -> str:
    """Generate 6-character uppercase alphanumeric code with checksum: GUEST-XXXXXX."""
    salt = os.getenv("SECRET_KEY", "blockvision-guest-salt-v2")
    base4 = "".join(secrets.choice(GUEST_CHARS) for _ in range(4))
    chk = _compute_checksum(base4, salt)
    return f"GUEST-{base4}{chk}"


def is_valid_guest_id_format(guest_id: str) -> bool:
    """Validate guest ID format and embedded HMAC checksum."""
    gid = (guest_id or '').strip().upper()
    if not (gid.startswith("GUEST-") and len(gid) == 12):
        return False
    base4 = gid[6:10]
    chk = gid[10:12]
    salt = os.getenv("SECRET_KEY", "blockvision-guest-salt-v2")
    return chk == _compute_checksum(base4, salt)


def create_guest_wallet() -> tuple:
    """
    Generate a new reusable Guest ID and persistent custodial Ethereum wallet.
    Returns: (guest_id, wallet_address)
    """
    wallets = _load_guest_wallets()

    guest_id = generate_guest_id()
    for _ in range(10):
        if guest_id not in wallets:
            break
        guest_id = generate_guest_id()

    salt = os.getenv("SECRET_KEY", "blockvision-guest-salt-v2")
    seed_hex = hashlib.sha256(f"guest_custodial_v2:{salt}:{guest_id}".encode('utf-8')).hexdigest()
    acc = Account.from_key("0x" + seed_hex)
    wallet_addr = acc.address.lower()

    wallets[guest_id] = {
        'wallet_address': wallet_addr,
        'created_at': datetime.utcnow().isoformat()
    }
    _save_guest_wallets(wallets)
    print(f"[GUEST WALLETS] Created {guest_id} -> {wallet_addr}")
    return guest_id, wallet_addr


def get_guest_wallet(guest_id: str) -> str | None:
    """
    Look up wallet address for a given Guest ID.
    Supports deterministic recovery if checksum matches so re-login works across serverless environments.
    """
    gid = (guest_id or '').strip().upper()
    if not gid:
        return None

    wallets = _load_guest_wallets()
    if gid in wallets and wallets[gid].get('wallet_address'):
        return wallets[gid]['wallet_address'].lower()

    # Check validity via format and cryptographic checksum
    if is_valid_guest_id_format(gid):
        salt = os.getenv("SECRET_KEY", "blockvision-guest-salt-v2")
        seed_hex = hashlib.sha256(f"guest_custodial_v2:{salt}:{gid}".encode('utf-8')).hexdigest()
        acc = Account.from_key("0x" + seed_hex)
        wallet_addr = acc.address.lower()

        wallets[gid] = {
            'wallet_address': wallet_addr,
            'created_at': datetime.utcnow().isoformat()
        }
        _save_guest_wallets(wallets)
        return wallet_addr

    return None
