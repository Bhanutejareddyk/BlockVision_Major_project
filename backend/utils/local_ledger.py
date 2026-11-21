"""
Built-in hash-chained ledger used when no Ethereum node is reachable.

Each registration is appended as a block whose hash covers the previous
block's hash, so any edit to an earlier record breaks the chain and is
detected by verify_chain(). It exposes the same interface as
BlockchainInterface so routes work unchanged on any machine.
"""
import os
import json
import time
import hashlib
import threading
from types import SimpleNamespace

from config import Config

_LOCK = threading.Lock()
GENESIS_HASH = '0' * 64


def _ledger_path():
    if os.environ.get('VERCEL') == '1':
        base = '/tmp/blockvision'
    else:
        base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
    os.makedirs(base, exist_ok=True)
    return os.path.join(base, 'ledger.json')


def _block_hash(block):
    payload = json.dumps({
        'index': block['index'],
        'image_hash': block['image_hash'],
        'file_name': block['file_name'],
        'owner': block['owner'],
        'timestamp': block['timestamp'],
        'prev_hash': block['prev_hash'],
    }, sort_keys=True).encode('utf-8')
    return hashlib.sha256(payload).hexdigest()


def _local_owner_address():
    seed = (Config.SECRET_KEY or 'blockvision').encode('utf-8')
    return '0x' + hashlib.sha256(b'blockvision-owner:' + seed).hexdigest()[:40]


class LocalLedger:
    mode = 'local'

    def __init__(self, path=None):
        self.path = path or _ledger_path()
        self.account = SimpleNamespace(address=_local_owner_address())
        self.contract_address = 'Local ledger'

    def _load(self):
        if not os.path.exists(self.path):
            return []
        try:
            with open(self.path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except (OSError, ValueError):
            return []

    def _save(self, blocks):
        tmp_path = f"{self.path}.tmp"
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(blocks, f, indent=2)
        os.replace(tmp_path, self.path)

    def _find(self, image_hash):
        target = (image_hash or '').strip().lower()
        for block in self._load():
            if block['image_hash'].lower() == target:
                return block
        return None

    def is_connected(self):
        return True

    def get_balance(self, address=None):
        return 0

    def verify_chain(self):
        prev = GENESIS_HASH
        for block in self._load():
            if block.get('prev_hash') != prev or _block_hash(block) != block.get('block_hash'):
                return False
            prev = block['block_hash']
        return True

    def register_image(self, image_hash, file_name):
        with _LOCK:
            blocks = self._load()
            if any(b['image_hash'].lower() == image_hash.lower() for b in blocks):
                raise RuntimeError('Image already registered')
            block = {
                'index': len(blocks),
                'image_hash': image_hash,
                'file_name': file_name,
                'owner': self.account.address,
                'timestamp': int(time.time()),
                'prev_hash': blocks[-1]['block_hash'] if blocks else GENESIS_HASH,
            }
            block['block_hash'] = _block_hash(block)
            blocks.append(block)
            self._save(blocks)
        return {
            'status': 'success',
            'transaction_hash': '0x' + block['block_hash'],
            'block_number': block['index'] + 1,
            'gas_used': 0,
        }

    def get_image_details(self, image_hash):
        block = self._find(image_hash)
        if not block:
            return {'exists': False, 'error': 'Image not registered'}
        return {
            'exists': True,
            'image_hash': block['image_hash'],
            'owner': block['owner'],
            'timestamp': block['timestamp'],
            'file_name': block['file_name'],
        }

    def verify_image(self, image_hash):
        details = self.get_image_details(image_hash)
        if details.get('exists'):
            return {**details, 'registered': True}
        return {'exists': False, 'registered': False, 'error': 'Image not registered'}

    def is_image_registered(self, image_hash):
        return self._find(image_hash) is not None

    def get_user_images(self, user_address):
        target = (user_address or '').lower()
        return [b['image_hash'] for b in self._load() if b['owner'].lower() == target]

    def get_total_images(self):
        return len(self._load())

    def get_image_by_index(self, index):
        return self._load()[index]['image_hash']
