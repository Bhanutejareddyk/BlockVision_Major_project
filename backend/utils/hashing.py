import hashlib
import io
import os
from PIL import Image, ImageChops, ImageEnhance


def calculate_image_hash(image_data):
    """
    Calculate exact cryptographic SHA-256 hash of image data
    """
    if isinstance(image_data, str):
        with open(image_data, 'rb') as f:
            image_bytes = f.read()
    elif hasattr(image_data, 'read'):
        image_bytes = image_data.read()
    else:
        image_bytes = image_data
    
    return hashlib.sha256(image_bytes).hexdigest()


def calculate_dhash(image_data, hash_size=8):
    """
    Calculate difference perceptual hash (dHash) for visual similarity matching.
    Robust to minor compression, resizing, and color tweaks.
    Returns 16-character hexadecimal string representing 64-bit fingerprint.
    """
    try:
        if isinstance(image_data, str):
            img = Image.open(image_data)
        elif isinstance(image_data, bytes):
            img = Image.open(io.BytesIO(image_data))
        else:
            img = image_data

        with img:
            # Convert to grayscale and resize to (hash_size + 1, hash_size)
            resized = img.convert('L').resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
            pixels = list(resized.getdata())

            # Compare adjacent pixels
            diff = []
            for row in range(hash_size):
                row_start = row * (hash_size + 1)
                for col in range(hash_size):
                    pixel_left = pixels[row_start + col]
                    pixel_right = pixels[row_start + col + 1]
                    diff.append(pixel_left > pixel_right)

            # Convert boolean array to hex string
            decimal_value = 0
            hex_string = []
            for index, value in enumerate(diff):
                if value:
                    decimal_value += 2 ** (index % 4)
                if index % 4 == 3:
                    hex_string.append(hex(decimal_value)[2:])
                    decimal_value = 0

            return "".join(hex_string)
    except Exception as e:
        print(f"Error calculating dHash: {e}")
        return "0" * (hash_size * hash_size // 4)


def calculate_hamming_distance(hash1, hash2):
    """Calculate bit-level Hamming distance between two hex hashes"""
    if not hash1 or not hash2 or len(hash1) != len(hash2):
        return 64
    try:
        val1 = int(hash1, 16)
        val2 = int(hash2, 16)
        xor_val = val1 ^ val2
        return bin(xor_val).count('1')
    except:
        return 64


def calculate_perceptual_similarity(hash1, hash2):
    """
    Calculate perceptual visual similarity percentage.
    0 Hamming distance = 100% identical visuals.
    Distance <= 10 considered visually matching under compression.
    """
    distance = calculate_hamming_distance(hash1, hash2)
    max_bits = len(hash1) * 4 if hash1 else 64
    similarity = max(0.0, (1.0 - (distance / max_bits))) * 100.0
    return round(similarity, 2), distance


def generate_tamper_diff_image(original_path, altered_path, output_path):
    """
    Generate side-by-side visual difference highlighting altered regions in neon red.
    """
    try:
        with Image.open(original_path) as orig_img, Image.open(altered_path) as alt_img:
            # Ensure same mode and size for comparison
            orig = orig_img.convert('RGB')
            alt = alt_img.convert('RGB')
            if orig.size != alt.size:
                alt = alt.resize(orig.size, Image.Resampling.LANCZOS)

            # Compute pixel difference
            diff = ImageChops.difference(orig, alt)
            
            # Amplify difference for visual clarity
            enhancer = ImageEnhance.Brightness(diff)
            diff_amplified = enhancer.enhance(3.5)

            # Create red highlight mask where difference exists
            gray_diff = diff.convert('L')
            mask = gray_diff.point(lambda p: 255 if p > 10 else 0)

            # Overlay red highlight onto altered image
            highlight = Image.new('RGB', orig.size, (255, 0, 80))
            result = Image.composite(highlight, alt, mask)

            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            result.save(output_path, quality=90)
            return True, output_path
    except Exception as e:
        print(f"Error generating visual diff: {e}")
        return False, str(e)


def verify_image_integrity(original_hash, image_data):
    """Verify if an image matches its original SHA-256 hash"""
    current_hash = calculate_image_hash(image_data)
    return current_hash.lower() == original_hash.lower()
