import os
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from werkzeug.utils import secure_filename
from utils.hashing import calculate_image_hash, calculate_dhash
from utils.encryption import ImageEncryption
from utils.image_handler import ImageHandler
from utils.steganography import SteganographyHandler
from utils.blockchain import get_blockchain
from utils.ipfs import upload_to_ipfs, get_ipfs_url
from utils.auth import require_auth
from utils.similarity import scan_stored_images_for_near_duplicates, find_near_duplicates
from config import Config

upload_bp = Blueprint('upload', __name__)


def process_image_upload(file, encrypt_option=False):
    """Core image upload processing logic with dual SHA-256 and perceptual dHash"""
    original_filename = file.filename or "unknown.jpg"
    safe_filename = secure_filename(original_filename) or "image.png"

    # Validate file type
    if not ImageHandler.allowed_file(safe_filename):
        return None, {'error': 'Invalid file type. Allowed: PNG, JPG, JPEG, GIF, BMP, WEBP'}, 400

    # Save uploaded file
    file_path, saved_name = ImageHandler.save_uploaded_file(file, Config.UPLOAD_FOLDER, safe_filename)

    # Validate file size against MAX_FILE_SIZE
    if os.path.getsize(file_path) > Config.MAX_FILE_SIZE:
        ImageHandler.cleanup_file(file_path)
        return None, {'error': 'File too large. Maximum size is 16MB.'}, 413

    # Validate image integrity
    is_valid, error = ImageHandler.validate_image(file_path)
    if not is_valid:
        ImageHandler.cleanup_file(file_path)
        return None, {'error': error}, 400

    # Calculate SHA-256 cryptographic hash and dHash perceptual visual fingerprint
    image_hash = calculate_image_hash(file_path)
    perceptual_hash = calculate_dhash(file_path)

    # Standardize filename to hash
    file_extension = os.path.splitext(saved_name)[1]
    new_filename = f"{image_hash}{file_extension}"
    new_file_path = os.path.join(Config.UPLOAD_FOLDER, new_filename)

    if file_path != new_file_path:
        if os.path.exists(new_file_path):
            ImageHandler.cleanup_file(new_file_path)
        os.rename(file_path, new_file_path)
        file_path = new_file_path
        saved_name = new_filename

    # Get image metadata
    image_info = ImageHandler.get_image_info(file_path)

    # Upload to IPFS via Pinata (never blocks upload if keys missing or fails)
    ipfs_cid = ""
    try:
        ipfs_cid = upload_to_ipfs(file_path)
    except Exception as e:
        print(f"[IPFS] Upload error during image upload: {e}")
        ipfs_cid = ""

    # Optional AES-256 encryption
    encryption_key = None
    if encrypt_option:
        encryptor = ImageEncryption()
        encryptor.generate_key()

        encrypted_filename = f"encrypted_{saved_name}"
        encrypted_path = os.path.join(Config.ENCRYPTED_FOLDER, encrypted_filename)
        encryptor.encrypt_file(file_path, encrypted_path)

        key_filename = f"{image_hash}.key"
        key_path = os.path.join(Config.KEYS_FOLDER, key_filename)
        encryptor.save_key(key_path)
        encryption_key = key_filename

    # Scan for near duplicates (Hamming distance <= 10)
    blockchain = get_blockchain()
    near_duplicates = scan_stored_images_for_near_duplicates(
        perceptual_hash,
        exclude_sha256=image_hash,
        blockchain=blockchain
    )

    response_data = {
        'success': True,
        'image_hash': image_hash,
        'perceptual_hash': perceptual_hash,
        'filename': original_filename,
        'saved_filename': saved_name,
        'file_size': image_info.get('file_size', 0),
        'dimensions': f"{image_info.get('width', 0)}x{image_info.get('height', 0)}",
        'format': image_info.get('format', 'Unknown'),
        'ipfsCID': ipfs_cid,
        'ipfsUrl': get_ipfs_url(ipfs_cid) if ipfs_cid else "",
        'timestamp': datetime.now().isoformat(),
        'encrypted': encrypt_option,
        'message': 'Image uploaded successfully. Ready for blockchain registration.'
    }

    if near_duplicates:
        top = near_duplicates[0]
        response_data['warning'] = f"Near-duplicate found: {top['similarity']} visually similar to image {top['similarTo'][:8]}... (Owner: {top['existingOwner'][:6]}...)"
        response_data['near_duplicate'] = top

    if encryption_key:
        response_data['encryption_key'] = encryption_key

    return response_data, None, 200


@upload_bp.route('/api/upload', methods=['POST'])
@require_auth
def upload_image():
    """Handle image upload and hash calculation for authenticated user"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        encrypt_option = request.form.get('encrypt', 'false').lower() == 'true'
        data, err, status = process_image_upload(file, encrypt_option)

        if err:
            return jsonify(err), status
        data['owner'] = g.wallet_address
        return jsonify(data), 200

    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@upload_bp.route('/api/register', methods=['POST'])
@require_auth
def register_on_blockchain():
    """Register image hash on blockchain with IPFS CID under user's wallet address"""
    try:
        data = request.get_json(silent=True)
        if not data or 'image_hash' not in data:
            return jsonify({'error': 'Image hash is required'}), 400

        image_hash = data['image_hash'].strip()
        filename = data.get('filename', 'unknown.jpg')
        ipfs_cid = data.get('ipfs_cid') or data.get('ipfsCID') or ''

        # If IPFS CID was not passed, check if file is in uploads and upload to Pinata
        if not ipfs_cid:
            for ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']:
                target = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}{ext}")
                if os.path.exists(target):
                    try:
                        ipfs_cid = upload_to_ipfs(target)
                    except Exception as err:
                        print(f"[IPFS] Error uploading during register: {err}")
                        ipfs_cid = ""
                    break

        blockchain = get_blockchain()
        details = blockchain.get_image_details(image_hash)
        is_re_register = False

        if details.get('exists'):
            if not details.get('isRevoked', False):
                return jsonify({
                    'error': 'Image already registered',
                    'image_hash': image_hash,
                    'owner': details.get('owner'),
                    'timestamp': details.get('timestamp'),
                    'ipfsCID': details.get('ipfsCID') or details.get('ipfs_cid', '')
                }), 409
            else:
                is_re_register = True

        user_wallet = g.wallet_address
        result = blockchain.register_image_for(user_wallet, image_hash, filename, ipfs_cid)

        if result['status'] == 'success':
            tx_hash = result['transaction_hash']

            # Call both: a) LSB watermark for backward compat, b) robust diagonal watermark
            for ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp']:
                target = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}{ext}")
                if os.path.exists(target):
                    try:
                        wm_path = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}_watermarked.png")
                        SteganographyHandler.embed_watermark(target, wm_path, f"tx:{tx_hash}")
                    except Exception as wm_err:
                        print(f"[WATERMARK WARNING] LSB watermark failed: {wm_err}")

                    try:
                        short_wallet = f"{user_wallet[:6]}...{user_wallet[-4:]}" if len(user_wallet) > 10 else user_wallet
                        short_hash = image_hash[:8]
                        robust_text = f"BlockVision • {short_wallet} • {short_hash}"
                        robust_path = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}_robust.png")
                        SteganographyHandler.embed_robust_watermark(target, robust_path, robust_text)
                    except Exception as rob_err:
                        print(f"[WATERMARK WARNING] Robust watermark failed: {rob_err}")
                    break

            msg = 'Image successfully registered on blockchain'
            if is_re_register:
                msg = 'Image re-registered successfully (previous registration was revoked).'

            resp = {
                'success': True,
                'message': msg,
                'transaction_hash': tx_hash,
                'block_number': result['block_number'],
                'gas_used': result['gas_used'],
                'image_hash': image_hash,
                'owner': user_wallet,
                'ipfsCID': ipfs_cid,
                'ipfsUrl': get_ipfs_url(ipfs_cid) if ipfs_cid else "",
                'watermarkedUrl': f"/api/image/{image_hash}_robust.png",
                'watermarkType': "visible + LSB",
                'timestamp': datetime.now().isoformat(),
                'isRevoked': False
            }
            if is_re_register:
                resp['warning'] = 'Previous registration was revoked. Image is now re-registered and active.'

            return jsonify(resp), 200
        else:
            return jsonify({
                'error': 'Blockchain registration failed',
                'details': result
            }), 500

    except Exception as e:
        return jsonify({'error': f'Registration failed: {str(e)}'}), 500


@upload_bp.route('/api/upload-and-register', methods=['POST'])
@require_auth
def upload_and_register():
    """Combined endpoint: upload, pin to IPFS, and register in one call under user's wallet"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        encrypt_option = request.form.get('encrypt', 'false').lower() == 'true'
        upload_data, err, status = process_image_upload(file, encrypt_option)
        if err:
            return jsonify(err), status

        image_hash = upload_data['image_hash']
        filename = upload_data['filename']
        ipfs_cid = upload_data.get('ipfsCID', '')

        blockchain = get_blockchain()
        details = blockchain.get_image_details(image_hash)
        is_re_register = False

        if details.get('exists'):
            if not details.get('isRevoked', False):
                return jsonify({
                    'error': 'Image already registered',
                    'image_hash': image_hash,
                    'owner': details.get('owner'),
                    'timestamp': details.get('timestamp'),
                    'ipfsCID': details.get('ipfsCID') or details.get('ipfs_cid', '')
                }), 409
            else:
                is_re_register = True

        user_wallet = g.wallet_address
        reg_result = blockchain.register_image_for(user_wallet, image_hash, filename, ipfs_cid)
        if reg_result['status'] != 'success':
            return jsonify({
                'error': 'Blockchain registration failed',
                'details': reg_result
            }), 500

        tx_hash = reg_result['transaction_hash']
        
        # Call both: a) LSB watermark for backward compat, b) robust diagonal watermark
        for ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp']:
            target = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}{ext}")
            if os.path.exists(target):
                try:
                    wm_path = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}_watermarked.png")
                    SteganographyHandler.embed_watermark(target, wm_path, f"tx:{tx_hash}")
                except Exception as wm_err:
                    print(f"[WATERMARK WARNING] LSB watermark failed: {wm_err}")

                try:
                    short_wallet = f"{user_wallet[:6]}...{user_wallet[-4:]}" if len(user_wallet) > 10 else user_wallet
                    short_hash = image_hash[:8]
                    robust_text = f"BlockVision • {short_wallet} • {short_hash}"
                    robust_path = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}_robust.png")
                    SteganographyHandler.embed_robust_watermark(target, robust_path, robust_text)
                except Exception as rob_err:
                    print(f"[WATERMARK WARNING] Robust watermark failed: {rob_err}")
                break

        msg = 'Image uploaded and registered successfully on blockchain.'
        if is_re_register:
            msg = 'Image re-registered successfully (previous registration was revoked).'

        combined = {
            **upload_data,
            'owner': user_wallet,
            'transaction_hash': tx_hash,
            'block_number': reg_result['block_number'],
            'gas_used': reg_result['gas_used'],
            'ipfsCID': ipfs_cid,
            'ipfsUrl': get_ipfs_url(ipfs_cid) if ipfs_cid else "",
            'watermarkedUrl': f"/api/image/{image_hash}_robust.png",
            'watermarkType': "visible + LSB",
            'message': msg,
            'isRevoked': False
        }
        if is_re_register:
            combined['warning'] = 'Previous registration was revoked. Image is now re-registered and active.'

        return jsonify(combined), 200

    except Exception as e:
        return jsonify({'error': f'Combined operation failed: {str(e)}'}), 500


@upload_bp.route('/api/revoke', methods=['POST'])
@require_auth
def revoke_image_endpoint():
    """Revoke an image registration on blockchain. Only owner can revoke."""
    try:
        data = request.get_json(silent=True) or {}
        image_hash = data.get('imageHash') or data.get('image_hash', '')
        image_hash = image_hash.strip()

        if not image_hash:
            return jsonify({'success': False, 'error': 'imageHash is required'}), 400

        blockchain = get_blockchain()
        details = blockchain.get_image_details(image_hash)

        if not details.get('exists'):
            return jsonify({'success': False, 'error': 'Image is not registered on blockchain'}), 404

        owner = details.get('owner', '')
        user_wallet = g.wallet_address
        if owner.lower() != user_wallet.lower():
            return jsonify({'success': False, 'error': 'Only owner can revoke'}), 403

        if details.get('isRevoked', False):
            return jsonify({
                'success': True,
                'message': 'Image is already revoked',
                'imageHash': image_hash,
                'revoked': True
            }), 200

        res = blockchain.revoke_image(image_hash, user_wallet)
        if res.get('status') == 'success' or res.get('isRevoked'):
            return jsonify({
                'success': True,
                'message': 'Image registration successfully revoked',
                'imageHash': image_hash,
                'revoked': True,
                'transaction_hash': res.get('transaction_hash')
            }), 200
        else:
            return jsonify({'success': False, 'error': res.get('error', 'Revocation failed')}), 500

    except PermissionError as pe:
        return jsonify({'success': False, 'error': str(pe)}), 403
    except ValueError as ve:
        return jsonify({'success': False, 'error': str(ve)}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': f'Revocation failed: {str(e)}'}), 500


@upload_bp.route('/api/check-duplicate', methods=['GET'])
def check_duplicate():
    """Check if hash exists, whether revoked, owner, and whether near-duplicates exist"""
    try:
        image_hash = request.args.get('hash', '').strip()
        if not image_hash:
            return jsonify({'error': 'hash query parameter is required'}), 400

        blockchain = get_blockchain()
        details = blockchain.get_image_details(image_hash)

        exists = bool(details.get('exists', False))
        is_revoked = bool(details.get('isRevoked', False))
        owner = details.get('owner', None) if exists else None

        # Check for near duplicates in stored files
        is_near_duplicate = False
        near_match = None
        for ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']:
            target = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}{ext}")
            if os.path.exists(target):
                dhash = calculate_dhash(target)
                matches = scan_stored_images_for_near_duplicates(dhash, exclude_sha256=image_hash, blockchain=blockchain)
                if matches:
                    is_near_duplicate = True
                    near_match = matches[0]
                break

        return jsonify({
            'success': True,
            'image_hash': image_hash,
            'exists': exists,
            'isRevoked': is_revoked,
            'owner': owner,
            'isNearDuplicate': is_near_duplicate,
            'nearMatch': near_match
        }), 200

    except Exception as e:
        return jsonify({'error': f'Duplicate check failed: {str(e)}'}), 500
