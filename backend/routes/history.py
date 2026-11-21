from datetime import datetime
from flask import Blueprint, request, jsonify, g
from web3 import Web3
from utils.blockchain import get_blockchain
from utils.auth import require_auth
from config import Config

history_bp = Blueprint('history', __name__)


@history_bp.route('/api/my-images', methods=['GET'])
@require_auth
def get_my_images():
    """Get all registered images belonging to the authenticated user's wallet"""
    try:
        user_address = g.wallet_address
        blockchain = get_blockchain()
        image_hashes = blockchain.get_user_images(user_address)

        images = []
        for image_hash in image_hashes:
            details = blockchain.get_image_details(image_hash)
            if details.get('exists'):
                cid = details.get('ipfsCID') or details.get('ipfs_cid') or ''
                is_rev = bool(details.get('isRevoked', False))
                images.append({
                    'image_hash': image_hash,
                    'owner': details['owner'],
                    'timestamp': details['timestamp'],
                    'registration_date': datetime.fromtimestamp(details['timestamp']).isoformat(),
                    'filename': details['file_name'],
                    'ipfsCID': cid,
                    'ipfsUrl': details.get('ipfsUrl', ''),
                    'isRevoked': is_rev,
                    'status': 'Revoked' if is_rev else 'Active'
                })

        return jsonify({
            'success': True,
            'wallet': user_address,
            'total_images': len(images),
            'images': images
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to fetch user images: {str(e)}'}), 500


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
                cid = details.get('ipfsCID') or details.get('ipfs_cid') or ''
                is_rev = bool(details.get('isRevoked', False))
                images.append({
                    'image_hash': image_hash,
                    'owner': details['owner'],
                    'timestamp': details['timestamp'],
                    'registration_date': datetime.fromtimestamp(details['timestamp']).isoformat(),
                    'filename': details['file_name'],
                    'ipfsCID': cid,
                    'ipfsUrl': details.get('ipfsUrl', ''),
                    'isRevoked': is_rev,
                    'status': 'Revoked' if is_rev else 'Active'
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
    """Get public blockchain and system statistics for dashboard and viva"""
    try:
        blockchain = get_blockchain()
        total_images = 0
        try:
            total_images = blockchain.get_total_images()
        except Exception as e:
            print(f"[STATS] Error fetching total images: {e}")

        total_verified = 0
        total_revoked = 0
        total_active = 0
        owners = set()
        all_loaded_images = []

        # Iterate over all registered images to compute stats and recent images
        for idx in range(total_images):
            try:
                img_hash = blockchain.get_image_by_index(idx)
                det = blockchain.get_image_details(img_hash)
                if det.get('exists'):
                    owner = det.get('owner', '')
                    if owner:
                        owners.add(owner.lower())
                    is_rev = bool(det.get('isRevoked', False))
                    if is_rev:
                        total_revoked += 1
                    else:
                        total_active += 1
                        total_verified += 1
                    cid = det.get('ipfsCID') or det.get('ipfs_cid') or ''
                    all_loaded_images.append({
                        'image_hash': img_hash,
                        'owner': owner,
                        'timestamp': det.get('timestamp', 0),
                        'registration_date': datetime.fromtimestamp(det.get('timestamp', 0)).isoformat() if det.get('timestamp') else '',
                        'filename': det.get('file_name', 'Unknown'),
                        'ipfsCID': cid,
                        'ipfsUrl': det.get('ipfsUrl') or (f"https://gateway.pinata.cloud/ipfs/{cid}" if cid else ""),
                        'isRevoked': is_rev,
                        'status': 'Revoked' if is_rev else 'Active'
                    })
            except Exception as item_err:
                print(f"[STATS] Error inspecting image at index {idx}: {item_err}")
                continue

        # Sort by timestamp descending for recent images (last 5)
        all_loaded_images.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
        recent_images = all_loaded_images[:5]

        is_connected = False
        try:
            is_connected = blockchain.is_connected()
        except Exception:
            pass

        stats = {
            'success': True,
            'totalImages': total_images,
            'totalVerified': total_verified,
            'totalRevoked': total_revoked,
            'totalActive': total_active,
            'totalOwners': len(owners),
            'recentImages': recent_images,
            # Backward compatibility fields
            'connected': is_connected,
            'total_images_registered': total_images,
            'mode': blockchain.mode,
            'contract_address': blockchain.contract_address,
            'network_id': Config.NETWORK_ID,
            'timestamp': datetime.now().isoformat()
        }

        if blockchain.account:
            try:
                balance = blockchain.get_balance()
                stats['account_address'] = blockchain.account.address
                stats['account_balance'] = f"{balance} ETH"
            except Exception:
                pass

        return jsonify(stats), 200

    except Exception as e:
        print(f"[STATS ERROR] {e}")
        return jsonify({
            'success': False,
            'totalImages': 0,
            'totalVerified': 0,
            'totalRevoked': 0,
            'totalActive': 0,
            'totalOwners': 0,
            'recentImages': [],
            'error': str(e)
        }), 200


@history_bp.route('/api/dashboard', methods=['GET'])
@require_auth
def get_dashboard_stats():
    """Get personal dashboard statistics for authenticated user's wallet"""
    try:
        user_wallet = g.wallet_address.strip().lower()
        blockchain = get_blockchain()
        
        my_total = 0
        my_active = 0
        my_revoked = 0
        my_transferred = 0

        # Scan all images to calculate user-specific counts
        total = 0
        try:
            total = blockchain.get_total_images()
        except Exception:
            pass

        for idx in range(total):
            try:
                img_hash = blockchain.get_image_by_index(idx)
                det = blockchain.get_image_details(img_hash)
                if not det.get('exists'):
                    continue
                curr_owner = (det.get('owner') or '').lower()
                prev_owner = (det.get('previousOwner') or '').lower()
                is_rev = bool(det.get('isRevoked', False))

                if curr_owner == user_wallet:
                    my_total += 1
                    if is_rev:
                        my_revoked += 1
                    else:
                        my_active += 1
                elif prev_owner == user_wallet and curr_owner != user_wallet:
                    my_transferred += 1
            except Exception:
                continue

        return jsonify({
            'success': True,
            'wallet': g.wallet_address,
            'myTotal': my_total,
            'myActive': my_active,
            'myRevoked': my_revoked,
            'myTransferred': my_transferred
        }), 200

    except Exception as e:
        print(f"[DASHBOARD ERROR] {e}")
        return jsonify({
            'success': False,
            'wallet': getattr(g, 'wallet_address', ''),
            'myTotal': 0,
            'myActive': 0,
            'myRevoked': 0,
            'myTransferred': 0,
            'error': str(e)
        }), 200


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
                        cid = details.get('ipfsCID') or details.get('ipfs_cid') or ''
                        is_rev = bool(details.get('isRevoked', False))
                        images.append({
                            'image_hash': image_hash,
                            'owner': details['owner'],
                            'timestamp': details['timestamp'],
                            'registration_date': datetime.fromtimestamp(details['timestamp']).isoformat(),
                            'filename': details['file_name'],
                            'ipfsCID': cid,
                            'ipfsUrl': details.get('ipfsUrl', ''),
                            'isRevoked': is_rev,
                            'status': 'Revoked' if is_rev else 'Active'
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
