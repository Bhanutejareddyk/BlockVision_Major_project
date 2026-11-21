from datetime import datetime
from flask import Blueprint, request, jsonify
from web3 import Web3
from utils.blockchain import get_blockchain
from config import Config

history_bp = Blueprint('history', __name__)


@history_bp.route('/api/history/<address>', methods=['GET'])
def get_user_history(address):
    """Get registration history for a specific user address"""
    try:
        # Validate Ethereum address
        if not Web3.is_address(address):
            return jsonify({'error': f"Invalid Ethereum address: '{address}'"}), 400

        blockchain = get_blockchain()
        image_hashes = blockchain.get_user_images(address)

        images = []
        for image_hash in image_hashes:
            details = blockchain.get_image_details(image_hash)
            if details.get('exists'):
                images.append({
                    'image_hash': image_hash,
                    'owner': details['owner'],
                    'timestamp': details['timestamp'],
                    'registration_date': datetime.fromtimestamp(details['timestamp']).isoformat(),
                    'filename': details['file_name']
                })

        return jsonify({
            'success': True,
            'address': Web3.to_checksum_address(address),
            'total_images': len(images),
            'images': images
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch history: {str(e)}'}), 500


@history_bp.route('/api/stats', methods=['GET'])
def get_stats():
    """Get blockchain and system statistics"""
    try:
        blockchain = get_blockchain()
        total_images = blockchain.get_total_images()
        is_connected = blockchain.is_connected()

        stats = {
            'success': True,
            'connected': is_connected,
            'total_images_registered': total_images,
            'mode': blockchain.mode,
            'contract_address': blockchain.contract_address,
            'network_id': Config.NETWORK_ID,
            'timestamp': datetime.now().isoformat()
        }

        # Include account address and balance if available
        if blockchain.account:
            balance = blockchain.get_balance()
            stats['account_address'] = blockchain.account.address
            stats['account_balance'] = f"{balance} ETH"

        return jsonify(stats), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch stats: {str(e)}'}), 500


@history_bp.route('/api/all-images', methods=['GET'])
def get_all_images():
    """Get all registered images with pagination using wrapper method"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)

        if page < 1:
            page = 1
        if per_page < 1:
            per_page = 20

        blockchain = get_blockchain()
        total = blockchain.get_total_images()

        start_idx = (page - 1) * per_page
        end_idx = min(start_idx + per_page, total)

        # Calculate retention cutoff time
        retention_days = Config.RETENTION_DAYS
        cutoff_timestamp = datetime.now().timestamp() - (retention_days * 24 * 60 * 60)

        images = []
        for idx in range(start_idx, end_idx):
            try:
                # Use wrapper instead of direct contract function call
                image_hash = blockchain.get_image_by_index(idx)
                details = blockchain.get_image_details(image_hash)

                if details.get('exists'):
                    if details['timestamp'] >= cutoff_timestamp:
                        images.append({
                            'image_hash': image_hash,
                            'owner': details['owner'],
                            'timestamp': details['timestamp'],
                            'registration_date': datetime.fromtimestamp(details['timestamp']).isoformat(),
                            'filename': details['file_name']
                        })
            except Exception as item_err:
                print(f"Error fetching image at index {idx}: {item_err}")
                continue

        total_pages = (total + per_page - 1) // per_page if total > 0 else 1

        return jsonify({
            'success': True,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages,
            'images': images
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch images: {str(e)}'}), 500
