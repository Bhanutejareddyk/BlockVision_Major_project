import os
import uuid
import threading
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from utils.hashing import (
    calculate_image_hash, 
    calculate_dhash, 
    calculate_perceptual_similarity,
    generate_tamper_diff_image
)
from utils.image_handler import ImageHandler
from utils.steganography import SteganographyHandler
from utils.blockchain import get_blockchain
from utils.local_ledger import LocalLedger
from utils.ipfs import get_ipfs_url
from config import Config

verify_bp = Blueprint('verify', __name__)


def get_verified_image_details(image_hash):
    """
    Check both blockchain and local ledger for an image hash.
    First checks primary blockchain interface; if not found or on error,
    falls back to LocalLedger. Guarantees records are found if stored in either.
    """
    clean_hash = (image_hash or '').strip().lower()
    if not clean_hash:
        return {'exists': False, 'isRevoked': False}

    details = {'exists': False}
    try:
        blockchain = get_blockchain()
        details = blockchain.get_image_details(clean_hash)
    except Exception as e:
        print(f"[VERIFY] Primary blockchain lookup error: {e}")
        details = {'exists': False}

    if not details.get('exists'):
        try:
            local = LocalLedger()
            local_details = local.get_image_details(clean_hash)
            if local_details.get('exists'):
                details = local_details
        except Exception as le:
            print(f"[VERIFY] Local ledger lookup fallback error: {le}")

    return details


@verify_bp.route('/api/verify', methods=['POST'])
def verify_image():
    """
    Public audit endpoint: Verify image authenticity against blockchain/ledger.
    Works WITHOUT login. Accepts field 'image', 'file', 'verifyImage', or 'images'.
    Hashes raw file bytes directly.
    """
    temp_path = None
    try:
        file = None
        for key in ['image', 'file', 'verifyImage', 'images']:
            if key in request.files:
                file_obj = request.files[key]
                if key == 'images':
                    files_list = request.files.getlist('images')
                    if files_list:
                        file_obj = files_list[0]
                if file_obj and file_obj.filename:
                    file = file_obj
                    break

        if not file or file.filename == '':
            return jsonify({
                'success': False,
                'verified': False,
                'status': 'ERROR',
                'error': 'No image file provided. Please select an image.'
            }), 400

        safe_name = secure_filename(file.filename) or "verify_image.png"
        if not ImageHandler.allowed_file(safe_name):
            return jsonify({
                'success': False,
                'verified': False,
                'status': 'ERROR',
                'error': 'Invalid file type. Allowed: PNG, JPG, JPEG, GIF, BMP, WEBP'
            }), 400

        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        unique_id = uuid.uuid4().hex
        temp_filename = f"temp_verify_{unique_id}_{safe_name}"
        temp_path = os.path.join(Config.UPLOAD_FOLDER, temp_filename)
        file.save(temp_path)

        try:
            is_valid, error = ImageHandler.validate_image(temp_path)
            if not is_valid:
                return jsonify({
                    'success': False,
                    'verified': False,
                    'status': 'ERROR',
                    'error': error or 'Invalid image data'
                }), 400

            # Calculate SHA-256 of RAW bytes and perceptual dHash
            image_hash = calculate_image_hash(temp_path).lower().strip()
            perceptual_hash = calculate_dhash(temp_path)
            image_info = ImageHandler.get_image_info(temp_path)

            # Check for steganographic and robust watermark safely
            has_wm, wm_data = False, None
            has_robust_wm = False
            try:
                has_wm, wm_data = SteganographyHandler.extract_watermark(temp_path)
                has_robust_wm = SteganographyHandler.verify_watermark_robust(temp_path)
            except Exception as wm_err:
                print(f"[VERIFY WATERMARK EXTRACTION WARNING] {wm_err}")

            watermark_detected = bool(has_wm or has_robust_wm)
            wm_type = "LSB Steganography" if has_wm else ("Robust Watermark" if has_robust_wm else "None")

            # Check both blockchain and local ledger
            image_details = get_verified_image_details(image_hash)

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
                        'message': 'This image registration was revoked by owner.',
                        'image_hash': image_hash,
                        'perceptual_hash': perceptual_hash,
                        'owner': image_details.get('owner', 'Unknown'),
                        'timestamp': image_details.get('timestamp', 0),
                        'registration_date': datetime.fromtimestamp(image_details['timestamp']).isoformat() if image_details.get('timestamp') else '',
                        'original_filename': image_details.get('file_name', safe_name),
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
                    'owner': image_details.get('owner', 'Unknown'),
                    'timestamp': image_details.get('timestamp', 0),
                    'registration_date': datetime.fromtimestamp(image_details['timestamp']).isoformat() if image_details.get('timestamp') else '',
                    'original_filename': image_details.get('file_name', safe_name),
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
                # Hash not found exactly on blockchain/ledger: Check for tampering using perceptual similarity
                best_match = None
                best_similarity = 0.0
                best_orig_path = None

                try:
                    from utils.similarity import scan_stored_images_for_near_duplicates
                    blockchain = get_blockchain()
                    near_matches = scan_stored_images_for_near_duplicates(perceptual_hash, exclude_sha256=image_hash, blockchain=blockchain)

                    for candidate in near_matches:
                        cand_hash = candidate.get('similarTo', '').lower().strip()
                        sim_score = candidate.get('similarity_score', 0)
                        if sim_score >= 85.0:
                            cand_details = get_verified_image_details(cand_hash)
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
                except Exception as sim_err:
                    print(f"[VERIFY SIMILARITY SCAN WARNING] {sim_err}")

                if best_match and best_similarity >= 85.0:
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
                            print(f"[TAMPER HEATMAP WARNING] {d_err}")

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
        print(f"[VERIFY ERROR] {e}")
        return jsonify({
            'success': False,
            'verified': False,
            'status': 'ERROR',
            'error': f'Verification failed: {str(e)}'
        }), 500


@verify_bp.route('/api/verify-hash', methods=['POST'])
def verify_hash():
    """
    Public audit endpoint: Verify image by hash only.
    Works WITHOUT login. Accepts 'image_hash', 'imageHash', or 'hash'.
    Checks both blockchain and local ledger.
    """
    try:
        data = request.get_json(silent=True) or {}
        image_hash = (
            data.get('image_hash') or 
            data.get('imageHash') or 
            data.get('hash') or 
            request.form.get('image_hash') or 
            request.form.get('hash') or 
            request.args.get('hash') or 
            ''
        ).strip().lower()

        if not image_hash:
            return jsonify({
                'success': False,
                'verified': False,
                'status': 'ERROR',
                'error': 'Image hash is required'
            }), 400

        image_details = get_verified_image_details(image_hash)

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
                    'message': 'This image registration was revoked by owner.',
                    'image_hash': image_hash,
                    'owner': image_details.get('owner', 'Unknown'),
                    'timestamp': image_details.get('timestamp', 0),
                    'registration_date': datetime.fromtimestamp(image_details['timestamp']).isoformat() if image_details.get('timestamp') else '',
                    'original_filename': image_details.get('file_name', 'Unknown'),
                    'ipfsCID': cid,
                    'ipfsUrl': get_ipfs_url(cid) if cid else ""
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
                'message': 'Hash verified on blockchain / ledger records',
                'image_hash': image_hash,
                'owner': image_details.get('owner', 'Unknown'),
                'timestamp': image_details.get('timestamp', 0),
                'registration_date': datetime.fromtimestamp(image_details['timestamp']).isoformat() if image_details.get('timestamp') else '',
                'original_filename': image_details.get('file_name', 'Unknown'),
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
                'similarity': '0%',
                'visual_similarity_percent': 0.0,
                'message': 'Hash not found on blockchain or ledger',
                'image_hash': image_hash
            }), 200

    except Exception as e:
        print(f"[VERIFY HASH ERROR] {e}")
        return jsonify({
            'success': False,
            'verified': False,
            'status': 'ERROR',
            'error': f'Hash verification failed: {str(e)}'
        }), 500


@verify_bp.route('/api/check-tampering', methods=['POST'])
def check_tampering():
    """
    Check if image has been tampered with compared to an original hash.
    Computes cryptographic SHA-256 match, perceptual visual similarity,
    and generates a visual tamper heatmap if differences exist.
    """
    temp_path = None
    try:
        file = None
        for key in ['image', 'file', 'verifyImage']:
            if key in request.files:
                file = request.files[key]
                break

        if not file:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

        original_hash = (request.form.get('original_hash') or request.form.get('originalHash') or '').strip().lower()
        if not original_hash:
            return jsonify({'success': False, 'error': 'Original hash is required'}), 400

        safe_name = secure_filename(file.filename) or "tamper_check.png"
        unique_id = uuid.uuid4().hex
        temp_path = os.path.join(Config.UPLOAD_FOLDER, f"temp_tamper_{unique_id}_{safe_name}")
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        file.save(temp_path)

        try:
            current_hash = calculate_image_hash(temp_path).lower().strip()
            current_dhash = calculate_dhash(temp_path)
            is_tampered = current_hash != original_hash

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

                try:
                    diff_filename = f"diff_{unique_id}_{safe_name}"
                    if not diff_filename.lower().endswith('.png'):
                        diff_filename += '.png'
                    diff_out_path = os.path.join(Config.UPLOAD_FOLDER, diff_filename)
                    ok, res_path = generate_tamper_diff_image(original_file_path, temp_path, diff_out_path)
                    if ok:
                        diff_image_url = f"/api/image/{diff_filename}"
                except Exception as d_err:
                    print(f"[TAMPER HEATMAP WARNING] {d_err}")

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
        return jsonify({'success': False, 'error': f'Tampering check failed: {str(e)}'}), 500


@verify_bp.route('/api/extract-watermark', methods=['POST'])
def extract_watermark():
    """Extract steganographic blockchain watermark from an uploaded image"""
    temp_path = None
    try:
        file = None
        for key in ['image', 'file']:
            if key in request.files:
                file = request.files[key]
                break

        if not file:
            return jsonify({'success': False, 'error': 'No image file provided'}), 400

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
        return jsonify({'success': False, 'error': f'Watermark extraction failed: {str(e)}'}), 500
