import os
from typing import List, Dict, Any, Optional
from utils.hashing import (
    calculate_dhash,
    calculate_hamming_distance,
    calculate_perceptual_similarity
)
from config import Config

# Threshold: Hamming distance <= 10 bits out of 64 bits corresponds to >= 84.38% similarity
MAX_HAMMING_DISTANCE_FOR_NEAR_DUPLICATE = 10


def find_near_duplicates(new_dhash: str, all_existing_dhashes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Compare a new image's 64-bit dHash against a list of existing image records.
    Each item in all_existing_dhashes should be a dict with:
        'dhash': 16-hex char perceptual hash,
        'image_hash': sha256 hash,
        'owner': owner address (optional),
        'filename': filename (optional)
    
    Returns all matches with bit-level Hamming distance <= 10 (>= 84.38% similarity).
    Sorted by highest similarity first.
    """
    if not new_dhash or not all_existing_dhashes:
        return []

    matches = []
    for item in all_existing_dhashes:
        existing_dhash = item.get('dhash') or item.get('perceptual_hash')
        if not existing_dhash:
            continue

        similarity_pct, distance = calculate_perceptual_similarity(new_dhash, existing_dhash)
        if distance <= MAX_HAMMING_DISTANCE_FOR_NEAR_DUPLICATE:
            matches.append({
                'similarTo': item.get('image_hash', ''),
                'similarity': f"{similarity_pct}%",
                'similarity_score': similarity_pct,
                'distance': distance,
                'existingOwner': item.get('owner', 'Unknown'),
                'filename': item.get('filename', item.get('file_name', ''))
            })

    # Sort descending by similarity
    matches.sort(key=lambda m: m['similarity_score'], reverse=True)
    return matches


def scan_stored_images_for_near_duplicates(
    new_dhash: str, 
    exclude_sha256: Optional[str] = None,
    blockchain=None
) -> List[Dict[str, Any]]:
    """
    Scan stored image files in UPLOAD_FOLDER to detect any visually near-duplicate images.
    """
    if not new_dhash:
        return []

    upload_dir = Config.UPLOAD_FOLDER
    if not os.path.exists(upload_dir):
        return []

    existing_candidates = []
    seen_hashes = set()
    extensions = ('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')

    for fname in os.listdir(upload_dir):
        if fname.startswith('temp_') or fname.startswith('diff_') or '_watermarked' in fname:
            continue
        
        base_name, ext = os.path.splitext(fname)
        if ext.lower() not in extensions:
            continue

        sha256_hash = base_name.lower()
        if exclude_sha256 and sha256_hash == exclude_sha256.lower():
            continue
        if sha256_hash in seen_hashes:
            continue

        seen_hashes.add(sha256_hash)
        file_path = os.path.join(upload_dir, fname)

        try:
            cand_dhash = calculate_dhash(file_path)
            owner = 'Unknown'
            if blockchain:
                try:
                    details = blockchain.get_image_details(sha256_hash)
                    if details.get('exists'):
                        owner = details.get('owner', 'Unknown')
                except Exception:
                    pass

            existing_candidates.append({
                'image_hash': sha256_hash,
                'dhash': cand_dhash,
                'owner': owner,
                'filename': fname
            })
        except Exception:
            continue

    return find_near_duplicates(new_dhash, existing_candidates)
