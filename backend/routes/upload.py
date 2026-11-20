import os
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from utils.hashing import calculate_image_hash, calculate_dhash
from utils.encryption import ImageEncryption
from utils.image_handler import ImageHandler
from utils.steganography import SteganographyHandler
from utils.blockchain import get_blockchain
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

    response_data = {
        'success': True,
        'image_hash': image_hash,
        'perceptual_hash': perceptual_hash,
        'filename': original_filename,
        'saved_filename': saved_name,
        'file_size': image_info.get('file_size', 0),
        'dimensions': f"{image_info.get('width', 0)}x{image_info.get('height', 0)}",
        'format': image_info.get('format', 'Unknown'),
        'timestamp': datetime.now().isoformat(),
        'encrypted': encrypt_option,
        'message': 'Image uploaded successfully. Ready for blockchain registration.'
    }

    if encryption_key:
        response_data['encryption_key'] = encryption_key

    return response_data, None, 200


@upload_bp.route('/api/upload', methods=['POST'])
def upload_image():
    """Handle image upload and hash calculation"""
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
        return jsonify(data), 200

    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@upload_bp.route('/api/register', methods=['POST'])
def register_on_blockchain():
    """Register image hash on blockchain using get_blockchain() helper"""
    try:
        data = request.get_json(silent=True)
        if not data or 'image_hash' not in data:
            return jsonify({'error': 'Image hash is required'}), 400

        image_hash = data['image_hash'].strip()
        filename = data.get('filename', 'unknown.jpg')

        blockchain = get_blockchain()

        if blockchain.is_image_registered(image_hash):
            return jsonify({
                'error': 'Image already registered on blockchain',
                'image_hash': image_hash
            }), 400

        result = blockchain.register_image(image_hash, filename)

        if result['status'] == 'success':
            tx_hash = result['transaction_hash']
            # Optional watermark embedding on the stored image
            for ext in ['.png', '.jpg', '.jpeg']:
                target = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}{ext}")
                if os.path.exists(target):
                    wm_path = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}_watermarked.png")
                    SteganographyHandler.embed_watermark(target, wm_path, f"tx:{tx_hash}")
                    break

            return jsonify({
                'success': True,
                'message': 'Image successfully registered on blockchain',
                'transaction_hash': tx_hash,
                'block_number': result['block_number'],
                'gas_used': result['gas_used'],
                'image_hash': image_hash,
                'timestamp': datetime.now().isoformat()
            }), 200
        else:
            return jsonify({
                'error': 'Blockchain registration failed',
                'details': result
            }), 500

    except Exception as e:
        return jsonify({'error': f'Registration failed: {str(e)}'}), 500


@upload_bp.route('/api/upload-and-register', methods=['POST'])
def upload_and_register():
    """Combined endpoint: upload and register in one call cleanly"""
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

        blockchain = get_blockchain()

        if blockchain.is_image_registered(image_hash):
            return jsonify({
                'error': 'Image already registered on blockchain',
                'image_hash': image_hash
            }), 400

        reg_result = blockchain.register_image(image_hash, filename)
        if reg_result['status'] != 'success':
            return jsonify({
                'error': 'Blockchain registration failed',
                'details': reg_result
            }), 500

        tx_hash = reg_result['transaction_hash']
        
        # Embed transaction watermark invisibly
        for ext in ['.png', '.jpg', '.jpeg']:
            target = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}{ext}")
            if os.path.exists(target):
                wm_path = os.path.join(Config.UPLOAD_FOLDER, f"{image_hash}_watermarked.png")
                SteganographyHandler.embed_watermark(target, wm_path, f"tx:{tx_hash}")
                break

        combined = {
            **upload_data,
            'transaction_hash': tx_hash,
            'block_number': reg_result['block_number'],
            'gas_used': reg_result['gas_used'],
            'message': 'Image uploaded and registered successfully on blockchain.'
        }
        return jsonify(combined), 200

    except Exception as e:
        return jsonify({'error': f'Combined operation failed: {str(e)}'}), 500
