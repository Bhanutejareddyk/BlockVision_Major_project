import os
import json
from web3 import Web3
from eth_account import Account
from config import Config
from utils.ipfs import get_ipfs_url

# Default ABI path
DEFAULT_ABI_PATH = os.path.join(
    os.path.dirname(__file__),
    '..',
    'contracts',
    'compiled',
    'ImageVerification.abi'
)


def load_contract_abi(abi_file=None):
    """Load contract ABI from file with default fallback"""
    target_path = abi_file or DEFAULT_ABI_PATH
    if not os.path.exists(target_path):
        raise FileNotFoundError(f"Contract ABI not found at {target_path}. Please run python deploy.py first.")
    with open(target_path, 'r', encoding='utf-8') as f:
        return json.load(f)


class BlockchainInterface:
    """Interface for interacting with Ethereum blockchain"""

    mode = 'ethereum'

    def __init__(self, node_url, contract_address, contract_abi, private_key=None):
        """Initialize blockchain interface"""
        self.web3 = Web3(Web3.HTTPProvider(node_url, request_kwargs={'timeout': 30}))
        self.contract_address = Web3.to_checksum_address(contract_address) if contract_address else None
        self.private_key = private_key
        
        # Load contract
        if self.contract_address and contract_abi:
            self.contract = self.web3.eth.contract(
                address=self.contract_address,
                abi=contract_abi
            )
        else:
            self.contract = None
        
        # Set default account if private key provided
        if private_key:
            self.account = Account.from_key(private_key)
            self.web3.eth.default_account = self.account.address
        else:
            self.account = None
    
    def is_connected(self):
        """Check if connected to blockchain node"""
        try:
            return self.web3.is_connected()
        except:
            return False
    
    def get_balance(self, address=None):
        """Get ETH balance of an address"""
        if address is None and self.account:
            address = self.account.address
        
        if address:
            try:
                balance = self.web3.eth.get_balance(Web3.to_checksum_address(address))
                return float(self.web3.from_wei(balance, 'ether'))
            except:
                return 0
        return 0
    
    def register_image(self, image_hash, file_name, ipfs_cid=""):
        """
        Register an image on the blockchain.
        Uses dynamic gas_price, chainId, and dual web3 v6/v7 raw_transaction compatibility.
        """
        if not self.contract or not self.account:
            raise RuntimeError("Contract or account not initialized")
        
        # Build transaction
        nonce = self.web3.eth.get_transaction_count(self.account.address)
        gas_price = self.web3.eth.gas_price
        chain_id = self.web3.eth.chain_id
        
        transaction = self.contract.functions.registerImage(
            image_hash,
            file_name,
            ipfs_cid or ""
        ).build_transaction({
            'from': self.account.address,
            'nonce': nonce,
            'gas': 500000,
            'gasPrice': gas_price,
            'chainId': chain_id
        })
        
        # Sign transaction
        signed_txn = self.web3.eth.account.sign_transaction(
            transaction,
            private_key=self.private_key
        )
        
        # Dual compatibility: web3 v6 (rawTransaction) and v7+ (raw_transaction)
        raw_tx = getattr(signed_txn, "raw_transaction", getattr(signed_txn, "rawTransaction", None))
        
        # Send transaction
        tx_hash = self.web3.eth.send_raw_transaction(raw_tx)
        
        # Wait for transaction receipt
        tx_receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
        
        return {
            'status': 'success' if tx_receipt.get('status') == 1 else 'failed',
            'transaction_hash': tx_hash.hex(),
            'block_number': tx_receipt.get('blockNumber'),
            'gas_used': tx_receipt.get('gasUsed'),
            'isRevoked': False
        }
    
    def register_image_for(self, user_address, image_hash, file_name, ipfs_cid=""):
        """
        Register an image on the blockchain on behalf of a specific user.
        The backend pays gas with its private key, but the on-chain owner is set to user_address.
        Uses dynamic gas_price, chainId, and dual web3 v6/v7 raw_transaction compatibility.
        """
        if not self.contract or not self.account:
            raise RuntimeError("Contract or account not initialized")
        
        target_owner = Web3.to_checksum_address(user_address)
        
        # Build transaction
        nonce = self.web3.eth.get_transaction_count(self.account.address)
        gas_price = self.web3.eth.gas_price
        chain_id = self.web3.eth.chain_id
        
        transaction = self.contract.functions.registerImageFor(
            target_owner,
            image_hash,
            file_name,
            ipfs_cid or ""
        ).build_transaction({
            'from': self.account.address,
            'nonce': nonce,
            'gas': 500000,
            'gasPrice': gas_price,
            'chainId': chain_id
        })
        
        # Sign transaction with backend private key
        signed_txn = self.web3.eth.account.sign_transaction(
            transaction,
            private_key=self.private_key
        )
        
        # Dual compatibility: web3 v6 (rawTransaction) and v7+ (raw_transaction)
        raw_tx = getattr(signed_txn, "raw_transaction", getattr(signed_txn, "rawTransaction", None))
        
        # Send transaction
        tx_hash = self.web3.eth.send_raw_transaction(raw_tx)
        
        # Wait for transaction receipt
        tx_receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
        
        return {
            'status': 'success' if tx_receipt.get('status') == 1 else 'failed',
            'transaction_hash': tx_hash.hex(),
            'block_number': tx_receipt.get('blockNumber'),
            'gas_used': tx_receipt.get('gasUsed'),
            'owner': target_owner,
            'isRevoked': False
        }

    def revoke_image(self, image_hash, user_wallet):
        """
        Revoke an image registration on the blockchain.
        Checks that image exists and user_wallet is the owner before calling revokeImage.
        Signed by backend relayer.
        """
        if not self.contract or not self.account:
            raise RuntimeError("Contract or account not initialized")
        
        details = self.get_image_details(image_hash)
        if not details.get('exists'):
            raise ValueError("Image is not registered")
        
        owner = details.get('owner', '')
        if not owner or owner.lower() != user_wallet.strip().lower():
            raise PermissionError("Only owner can revoke")
        
        if details.get('isRevoked'):
            return {
                'status': 'already_revoked',
                'message': 'Image is already revoked',
                'image_hash': image_hash,
                'isRevoked': True
            }
        
        # Build transaction calling revokeImage
        nonce = self.web3.eth.get_transaction_count(self.account.address)
        gas_price = self.web3.eth.gas_price
        chain_id = self.web3.eth.chain_id
        
        transaction = self.contract.functions.revokeImage(
            image_hash
        ).build_transaction({
            'from': self.account.address,
            'nonce': nonce,
            'gas': 300000,
            'gasPrice': gas_price,
            'chainId': chain_id
        })
        
        signed_txn = self.web3.eth.account.sign_transaction(
            transaction,
            private_key=self.private_key
        )
        
        raw_tx = getattr(signed_txn, "raw_transaction", getattr(signed_txn, "rawTransaction", None))
        tx_hash = self.web3.eth.send_raw_transaction(raw_tx)
        tx_receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
        
        return {
            'status': 'success' if tx_receipt.get('status') == 1 else 'failed',
            'transaction_hash': tx_hash.hex(),
            'block_number': tx_receipt.get('blockNumber'),
            'gas_used': tx_receipt.get('gasUsed'),
            'image_hash': image_hash,
            'isRevoked': True
        }
    
    def get_image_details(self, image_hash):
        """
        Get image details from blockchain view function.
        Order: (imageHash, owner, timestamp, fileName, ipfsCID, exists, isRevoked)
        """
        if not self.contract:
            raise RuntimeError("Contract not initialized")
        
        try:
            result = self.contract.functions.getImageDetails(image_hash).call()
            if len(result) >= 7:
                img_hash, owner, timestamp, file_name, ipfs_cid, exists, is_revoked = result[:7]
            else:
                img_hash, owner, timestamp, file_name, ipfs_cid, exists = result[:6]
                is_revoked = False
            cid = ipfs_cid or ''
            
            return {
                'exists': bool(exists),
                'image_hash': img_hash,
                'owner': owner,
                'timestamp': timestamp,
                'file_name': file_name,
                'ipfs_cid': cid,
                'ipfsCID': cid,
                'ipfsUrl': get_ipfs_url(cid),
                'isRevoked': bool(is_revoked)
            }
        except Exception as e:
            return {
                'exists': False,
                'isRevoked': False,
                'error': str(e)
            }
    
    def verify_image(self, image_hash):
        """Verify an image on the blockchain using view function"""
        details = self.get_image_details(image_hash)
        if details.get('exists'):
            cid = details.get('ipfsCID') or details.get('ipfs_cid') or ''
            is_revoked = details.get('isRevoked', False)
            return {
                'exists': True,
                'owner': details.get('owner'),
                'timestamp': details.get('timestamp'),
                'file_name': details.get('file_name'),
                'ipfs_cid': cid,
                'ipfsCID': cid,
                'ipfsUrl': details.get('ipfsUrl') or get_ipfs_url(cid),
                'registered': True,
                'isRevoked': is_revoked,
                'status': 'REVOKED' if is_revoked else 'VERIFIED'
            }
        return {
            'exists': False,
            'registered': False,
            'isRevoked': False,
            'status': 'NOT_FOUND',
            'error': details.get('error', 'Image not registered')
        }
    
    def is_image_registered(self, image_hash):
        """Check if image hash is registered"""
        if not self.contract:
            return False
        try:
            return self.contract.functions.isImageRegistered(image_hash).call()
        except:
            return False

    def is_image_revoked(self, image_hash):
        """Check if image hash is revoked"""
        if not self.contract:
            return False
        try:
            return self.contract.functions.isImageRevoked(image_hash).call()
        except:
            details = self.get_image_details(image_hash)
            return details.get('isRevoked', False)
    
    def get_user_images(self, user_address):
        """Get all image hashes registered by a user"""
        if not self.contract:
            raise RuntimeError("Contract not initialized")
        try:
            checksum_addr = Web3.to_checksum_address(user_address)
            return self.contract.functions.getUserImages(checksum_addr).call()
        except Exception as e:
            print(f"Error fetching user images: {e}")
            return []
    
    def get_total_images(self):
        """Get total number of registered images"""
        if not self.contract:
            return 0
        try:
            return self.contract.functions.getTotalImages().call()
        except:
            return 0
    
    def get_image_by_index(self, index):
        """Wrapper to get image hash by index"""
        if not self.contract:
            raise RuntimeError("Contract not initialized")
        return self.contract.functions.getImageByIndex(index).call()
    
    def get_transaction_history(self, address=None):
        """
        Get transaction history for an address.
        Optimized to search only the last 100 blocks (not 1000) for performance.
        """
        if address is None and self.account:
            address = self.account.address
        
        if not address:
            return []
        
        latest_block = self.web3.eth.block_number
        transactions = []
        
        # Search recent 100 blocks only
        start_block = max(0, latest_block - 100)
        target_addr = address.lower()
        
        for block_num in range(start_block, latest_block + 1):
            try:
                block = self.web3.eth.get_block(block_num, full_transactions=True)
                for tx in block.transactions:
                    tx_from = tx.get('from', '') or ''
                    tx_to = tx.get('to', '') or ''
                    if tx_from.lower() == target_addr or tx_to.lower() == target_addr:
                        transactions.append({
                            'hash': tx['hash'].hex(),
                            'from': tx_from,
                            'to': tx_to,
                            'value': float(self.web3.from_wei(tx['value'], 'ether')),
                            'block_number': block_num,
                            'timestamp': block['timestamp']
                        })
            except:
                continue
        
        return transactions


def get_blockchain():
    """
    Return the Ethereum interface when a node and contract are reachable,
    otherwise the built-in LocalLedger so the app works on any machine.
    Set BLOCKCHAIN_MODE=ethereum to require Ethereum, or =local to skip it.
    """
    from utils.local_ledger import LocalLedger

    mode = os.getenv('BLOCKCHAIN_MODE', 'auto').strip().lower()
    if mode == 'local':
        return LocalLedger()
    try:
        return _get_ethereum_blockchain()
    except Exception as e:
        if mode == 'ethereum':
            raise
        print(f"[BLOCKCHAIN] Ethereum unavailable ({e}); using local ledger.")
        return LocalLedger()


def _get_ethereum_blockchain():
    contract_address = Config.CONTRACT_ADDRESS
    if not contract_address:
        raise RuntimeError("CONTRACT_ADDRESS not configured. Please run python deploy.py first.")
    
    abi = load_contract_abi()
    node_url = Config.ETHEREUM_NODE_URL
    private_key = Config.PRIVATE_KEY
    
    blockchain = BlockchainInterface(
        node_url=node_url,
        contract_address=contract_address,
        contract_abi=abi,
        private_key=private_key
    )
    
    if not blockchain.is_connected():
        raise RuntimeError(f"Cannot connect to blockchain node at {node_url}. Please ensure Ganache is running.")
        
    return blockchain
