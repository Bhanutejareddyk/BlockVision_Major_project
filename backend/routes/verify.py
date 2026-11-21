import os
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from utils.hashing import (
    calculate_image_hash, 
    calculate_dhash, 
    calculate_perceptual_similarity,
    generate_tamper_diff_image
)
from utils.similarity import scan_stored_images_for_near_duplicates
from utils.image_handler import ImageHandler
from utils.steganography import SteganographyHandler
from utils.blockchain import get_blockchain
from utils.ipfs import get_ipfs_url
from config import Config

verify_bp = Blueprint('verify', __name__)


@verify_bp.route('/api/verify', methods=['POST'])
def verify_image():
    """Verify image authenticity against blockchain using uuid temp file with guaranteed cleanup"""
    temp_path = None
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        safe_name = secure_filename(file.filename) or "verify_image.png"
        if not ImageHandler.allowed_file(safe_name):
            return jsonify({'error': 'Invalid file type. Allowed: PNG, JPG, JPEG, GIF, BMP, WEBP'}), 400
        
        unique_id = uuid.uuid4().hex
        temp_filename = f"temp_verify_{unique_id}_{safe_name}"
        temp_path = os.path.join(Config.UPLOAD_FOLDER, temp_filename)
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        file.save(temp_path)
        
        try:
            is_valid, error = ImageHandler.validate_image(temp_path)
            if not is_valid:
                return jsonify({'error': error}), 400
            
            # Calculate SHA-256 and perceptual dHash
            image_hash = calculate_image_hash(temp_path)
            perceptual_hash = calculate_dhash(temp_path)
            image_info = ImageHandler.get_image_info(temp_path)
            
            # Check for steganographic and robust watermark
            has_wm, wm_data = SteganographyHandler.extract_watermark(temp_path)
            has_robust_wm = SteganographyHandler.verify_watermark_robust(temp_path)
            watermark_detected = bool(has_wm or has_robust_wm)
            wm_type = "LSB Steganography" if has_wm else ("Robust Watermark" if has_robust_wm else "None")
            
            blockchain = get_blockchain()
            image_details = blockchain.get_image_details(image_hash)
            
            if image_details.get('exists'):
                cid = image_details.get('ipfsCID') or image_details.get('ipfs_cid') or ''
                is_revoked = bool(image_details.get('isRevoked', False))

                if is_revoked:
                    return jsonify({
                        'success': True,
                        'verified': False,
                        'authentic': False,
                        'status': 'REVOKED',
                        'isRevoked': True,
                        'message': 'This image registration was revoked by owner',
                        'image_hash': image_hash,
                        'perceptual_hash': perceptual_hash,
                        'owner': image_details['owner'],
                        'timestamp': image_details['timestamp'],
                        'registration_date': datetime.fromtimestamp(image_details['timestamp']).isoformat(),
                        'original_filename': image_details['file_name'],
                        'uploaded_filename': file.filename,
                        'file_size': image_info.get('file_size', 0),
                        'dimensions': f"{image_info.get('width', 0)}x{image_info.get('height', 0)}",
                        'format': image_info.get('format', 'Unknown'),
                        'ipfsCID': cid,
                        'ipfsUrl': get_ipfs_url(cid) if cid else "",
                        'watermark_detected': watermark_detected,
                        'watermark_type': wm_type,
                        'embedded_watermark': wm_data if has_wm else None
                    }), 200

                return jsonify({
                    'success': True,
                    'verified': True,
                    'authentic': True,
                    'status': 'VERIFIED',
                    'isRevoked': False,
                    'similarity': '100%',
                    'visual_similarity_percent': 100.0,
                    'similarity_score': 100.0,
                    'message': 'Image is verified and authentic (100% cryptographic match)',
                    'image_hash': image_hash,
                    'perceptual_hash': perceptual_hash,
                    'owner': image_details['owner'],
                    'timestamp': image_details['timestamp'],
                    'registration_date': datetime.fromtimestamp(image_details['timestamp']).isoformat(),
                    'original_filename': image_details['file_name'],
                    'uploaded_filename': file.filename,
                    'file_size': image_info.get('file_size', 0),
                    'dimensions': f"{image_info.get('width', 0)}x{image_info.get('height', 0)}",
                    'format': image_info.get('format', 'Unknown'),
                    'ipfsCID': cid,
                    'ipfsUrl': get_ipfs_url(cid) if cid else "",
                    'watermark_detected': watermark_detected,
                    'watermark_type': wm_type,
                    'embedded_watermark': wm_data if has_wm else None
                }), 200
            else:
                # Hash not found exactly on blockchain: Check for tampering against registered images using perceptual similarity
                near_matches = scan_stored_images_for_near_duplicates(perceptual_hash, exclude_sha256=image_hash, blockchain=blockchain)
                best_match = None
                best_similarity = 0.0
                best_orig_path = None

                for candidate in near_matches:
                    cand_hash = candidate.get('similarTo')
                    sim_score = candidate.get('similarity_score', 0)
                    if sim_score >= 85.0:
                        cand_details = blockchain.get_image_details(cand_hash)
                        if cand_details.get('exists') and not cand_details.get('isRevoked', False):
                            best_match = candidate
                            best_similarity = sim_score
                            best_match['existingOwner'] = cand_details.get('owner', 'Unknown')
                            best_match['filename'] = cand_details.get('file_name', '')
                            for ext in ['.png', '.jpg', '.jpeg', '.webp', '.bmp']:
                                cand_path = os.path.join(Config.UPLOAD_FOLDER, f"{cand_hash}{ext}")
                                if os.path.exists(cand_path):
                                    best_orig_path = cand_path
                                    break
                            break

                if best_match and best_similarity >= 85.0:
                    # Generate visual difference heatmap if original file exists on disk
                    diff_image_url = None
                    if best_orig_path:
                        try:
                            diff_filename = f"diff_{unique_id}_{safe_name}"
                            if not diff_filename.lower().endswith('.png'):
                                diff_filename += '.png'
                            diff_out_path = os.path.join(Config.UPLOAD_FOLDER, diff_filename)
                            ok, res_path = generate_tamper_diff_image(best_orig_path, temp_path, diff_out_path)
                            if ok:
                                diff_image_url = f"/api/image/{diff_filename}"
                        except Exception as d_err:
                            print(f"[TAMPER HEATMAP ERROR] {d_err}")

                    sim_rounded = round(best_similarity, 1)
                    return jsonify({
                        'success': True,
                        'verified': False,
                        'authentic': False,
                        'tampered': True,
                        'status': 'SIMILAR - POSSIBLE TAMPERED COPY',
                        'isRevoked': False,
                        'similarity': f"{sim_rounded}%",
                        'visual_similarity_percent': sim_rounded,
                        'similarity_score': sim_rounded,
                        'message': f"Image looks {sim_rounded}% similar to registered image - May be cropped / compressed / tampered.",
                        'image_hash': image_hash,
                        'perceptual_hash': perceptual_hash,
                        'original_hash': best_match.get('similarTo', ''),
                        'original_owner': best_match.get('existingOwner', 'Unknown'),
                        'original_filename': best_match.get('filename', ''),
                        'uploaded_filename': file.filename,
                        'file_size': image_info.get('file_size', 0),
                        'dimensions': f"{image_info.get('width', 0)}x{image_info.get('height', 0)}",
                        'format': image_info.get('format', 'Unknown'),
                        'diff_heatmap_url': diff_image_url,
                        'heatmap_url': diff_image_url,
                        'heatmap_available': diff_image_url is not None,
                        'watermark_detected': watermark_detected,
                        'watermark_type': wm_type,
                        'embedded_watermark': wm_data if has_wm else None
                    }), 200

                return jsonify({
                    'success': True,
                    'verified': False,
                    'authentic': False,
                    'status': 'NOT_FOUND',
                    'isRevoked': False,
                    'similarity': '0%',
                    'visual_similarity_percent': 0.0,
                    'message': 'Image not found on blockchain. This image is not registered.',
                    'image_hash': image_hash,
                    'perceptual_hash': perceptual_hash,
                    'uploaded_filename': file.filename,
                    'file_size': image_info.get('file_size', 0),
                    'dimensions': f"{image_info.get('width', 0)}x{image_info.get('height', 0)}",
                    'format': image_info.get('format', 'Unknown'),
                    'watermark_detected': watermark_detected,
                    'watermark_type': wm_type,
                    'embedded_watermark': wm_data if has_wm else None
                }), 200

        finally:
            if temp_path:
                ImageHandler.cleanup_file(temp_path)
            
    except Exception as e:
        return jsonify({'error': f'Verification failed: {str(e)}'}), 500


@verify_bp.route('/api/verify-hash', methods=['POST'])
def verify_hash():
    """Verify image by hash only using view function"""
    try:
        data = request.get_json(silent=True)
        if not data or 'image_hash' not in data:
            return jsonify({'error': 'Image hash is required'}), 400
        
        image_hash = data['image_hash'].strip()
        blockchain = get_blockchain()
        image_details = blockchain.get_image_details(image_hash)
        
        if image_details.get('exists'):
            cid = image_details.get('ipfsCID') or image_details.get('ipfs_cid') or ''
            is_revoked = bool(image_details.get('isRevoked', False))

            if is_revoked:
                return jsonify({
                    'success': True,
                    'verified': False,
                    'authentic': False,
                    'status': 'REVOKED',
                    'isRevoked': True,
                    'message': 'This image registration was revoked by owner',
                    'image_hash': image_hash,
                    'owner': image_details['owner'],
                    'timestamp': image_details['timestamp'],
                    'registration_date': datetime.fromtimestamp(image_details['timestamp']).isoformat(),
                    'original_filename': image_details['file_name'],
                    'ipfsCID': cid,
                    'ipfsUrl': get_ipfs_url(cid) if cid else ""
                }), 200

            return jsonify({
                'success': True,
                'verified': True,
                'authentic': True,
                'status': 'VERIFIED',
                'isRevoked': False,
                'message': 'Hash verified on blockchain',
                'image_hash': image_hash,
                'owner': image_details['owner'],
                'timestamp': image_details['timestamp'],
                'registration_date': datetime.fromtimestamp(image_details['timestamp']).isoformat(),
                'original_filename': image_details['file_name'],
                'ipfsCID': cid,
                'ipfsUrl': get_ipfs_url(cid) if cid else ""
            }), 200
        else:
            return jsonify({
                'success': True,
                'verified': False,
                'authentic': False,
                'status': 'NOT_FOUND',
                'isRevoked': False,
                'message': 'Hash not found on blockchain',
                'image_hash': image_hash
            }), 200
            
    except Exception as e:
        return jsonify({'error': f'Hash verification failed: {str(e)}'}), 500


@verify_bp.route('/api/check-tampering', methods=['POST'])
def check_tampering():
    """
    Check if image has been tampered with.
    Computes cryptographic SHA-256 match, perceptual visual similarity,
    and generates a visual tamper heatmap if differences exist.
    """
    temp_path = None
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        if 'original_hash' not in request.form:
            return jsonify({'error': 'Original hash is required'}), 400
        
        file = request.files['image']
        original_hash = request.form['original_hash'].strip()
        
        safe_name = secure_filename(file.filename) or "tamper_check.png"
        unique_id = uuid.uuid4().hex
        temp_path = os.path.join(Config.UPLOAD_FOLDER, f"temp_tamper_{unique_id}_{safe_name}")
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        file.save(temp_path)
        
        try:
            current_hash = calculate_image_hash(temp_path)
            current_dhash = calculate_dhash(temp_path)
            is_tampered = current_hash.lower() != original_hash.lower()

            # Attempt to locate original registered file on disk
            original_file_path = None
            for ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']:
                candidate = os.path.join(Config.UPLOAD_FOLDER, f"{original_hash}{ext}")
                if os.path.exists(candidate):
                    original_file_path = candidate
                    break

            visual_similarity = 100.0
            hamming_distance = 0
            diff_image_url = None

            if original_file_path and is_tampered:
                orig_dhash = calculate_dhash(original_file_path)
                visual_similarity, hamming_distance = calculate_perceptual_similarity(orig_dhash, current_dhash)

                # Generate visual difference heatmap
                diff_filename = f"diff_{unique_id}_{safe_name}"
                diff_out_path = os.path.join(Config.UPLOAD_FOLDER, diff_filename)
                ok, res_path = generate_tamper_diff_image(original_file_path, temp_path, diff_out_path)
                if ok:
                    diff_image_url = f"/api/image/{diff_filename}"

            return jsonify({
                'success': True,
                'tampered': is_tampered,
                'original_hash': original_hash,
                'current_hash': current_hash,
                'current_perceptual_hash': current_dhash,
                'visual_similarity_percent': visual_similarity,
                'hamming_distance': hamming_distance,
                'heatmap_available': diff_image_url is not None,
                'heatmap_url': diff_image_url,
                'message': 'Image has been tampered with' if is_tampered else 'Image is bit-for-bit intact and authentic'
            }), 200
        finally:
            if temp_path:
                ImageHandler.cleanup_file(temp_path)
        
    except Exception as e:
        return jsonify({'error': f'Tampering check failed: {str(e)}'}), 500


@verify_bp.route('/api/extract-watermark', methods=['POST'])
def extract_watermark():
    """Extract steganographic blockchain watermark from an uploaded image"""
    temp_path = None
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        unique_id = uuid.uuid4().hex
        safe_name = secure_filename(file.filename) or "wm_check.png"
        temp_path = os.path.join(Config.UPLOAD_FOLDER, f"temp_wm_{unique_id}_{safe_name}")
        file.save(temp_path)

        try:
            found, payload = SteganographyHandler.extract_watermark(temp_path)
            return jsonify({
                'success': True,
                'watermark_found': found,
                'payload': payload if found else None,
                'message': 'Watermark extracted successfully' if found else 'No watermark detected'
            }), 200
        finally:
            if temp_path:
                ImageHandler.cleanup_file(temp_path)
    except Exception as e:
        return jsonify({'error': f'Watermark extraction failed: {str(e)}'}), 500
