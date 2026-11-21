import os
import math
from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo


def _get_font(size):
    """Attempt to load a clean TrueType font, falling back to PIL default font"""
    candidates = ["arial.ttf", "Arial.ttf", "DejaVuSans.ttf", "segoeui.ttf", "calibri.ttf"]
    for font_name in candidates:
        try:
            return ImageFont.truetype(font_name, size)
        except Exception:
            continue
    try:
        return ImageFont.load_default(size=size)
    except Exception:
        return ImageFont.load_default()


class SteganographyHandler:
    """
    Dual Steganography and Robust Watermarking System:
    1. Invisible LSB steganography (pixel bit embedding)
    2. Robust semi-transparent diagonal repeated watermark (survives compression/screenshots)
    3. Visible provenance badge overlay
    """

    DELIMITER = "##END_BLOCKVISION##"

    # ========================================================
    # 1. CLASSIC LSB EMBEDDING (BACKWARD COMPATIBILITY)
    # ========================================================
    @classmethod
    def embed_watermark(cls, input_image_path, output_image_path, text_to_hide):
        """
        Embeds a text payload (e.g. blockchain transaction hash) into image pixels.
        Saves output as PNG to preserve lossless pixel values.
        """
        try:
            with Image.open(input_image_path) as img:
                encoded = img.convert('RGB')
                width, height = encoded.size

                payload = text_to_hide + cls.DELIMITER
                binary_payload = ''.join(format(ord(char), '08b') for char in payload)
                payload_len = len(binary_payload)
                max_capacity = width * height * 3

                if payload_len > max_capacity:
                    return False, f"Image too small: capacity {max_capacity} bits, payload requires {payload_len} bits."

                pixels = list(encoded.getdata())
                new_pixels = []
                data_idx = 0

                for pixel in pixels:
                    r, g, b = pixel
                    if data_idx < payload_len:
                        r = (r & ~1) | int(binary_payload[data_idx])
                        data_idx += 1
                    if data_idx < payload_len:
                        g = (g & ~1) | int(binary_payload[data_idx])
                        data_idx += 1
                    if data_idx < payload_len:
                        b = (b & ~1) | int(binary_payload[data_idx])
                        data_idx += 1
                    new_pixels.append((r, g, b))

                encoded.putdata(new_pixels)
                os.makedirs(os.path.dirname(output_image_path), exist_ok=True)
                encoded.save(output_image_path, format='PNG')
                return True, output_image_path
        except Exception as e:
            return False, str(e)

    @classmethod
    def extract_watermark(cls, image_path):
        """
        Extracts embedded watermark payload from image pixels.
        Returns payload string or None if no watermark found.
        """
        try:
            with Image.open(image_path) as img:
                img_rgb = img.convert('RGB')
                pixels = list(img_rgb.getdata())

                binary_chars = []
                extracted_bits = ""

                for pixel in pixels:
                    for color in pixel[:3]:
                        extracted_bits += str(color & 1)
                        if len(extracted_bits) == 8:
                            char = chr(int(extracted_bits, 2))
                            binary_chars.append(char)
                            extracted_bits = ""

                            # Check for delimiter
                            current_str = "".join(binary_chars[-len(cls.DELIMITER):])
                            if current_str == cls.DELIMITER:
                                full_text = "".join(binary_chars[:-len(cls.DELIMITER)])
                                return True, full_text

                return False, "No watermark detected in image."
        except Exception as e:
            return False, str(e)

    # ========================================================
    # 2. ROBUST DIAGONAL WATERMARK (UPGRADE #6)
    # ========================================================
    @classmethod
    def embed_robust_watermark(cls, input_path, output_path, text):
        """
        Draws semi-transparent diagonal repeated text across the entire image at a 25-degree angle.
        Opacity: 90/255, Font size: width // 25, Color: white with black shadow.
        Compatible with JPG, PNG, WEBP. Saves output as PNG.
        """
        try:
            with Image.open(input_path) as base_img:
                base = base_img.convert('RGBA')
                w, h = base.size

                font_size = max(14, w // 25)
                font = _get_font(font_size)

                # Format pattern text: "BlockVision • 0x... • <hash>"
                watermark_text = text or "BlockVision • Authenticated on Sepolia"

                # Calculate text dimensions
                try:
                    bbox = font.getbbox(watermark_text)
                    tw = bbox[2] - bbox[0]
                    th = bbox[3] - bbox[1]
                except Exception:
                    tw = len(watermark_text) * (font_size // 2)
                    th = font_size

                spacing_x = max(int(tw * 1.4), 160)
                spacing_y = max(int(th * 3.5), 60)

                # Create canvas larger than image diagonal to accommodate 25-degree rotation
                diagonal = int(math.hypot(w, h)) * 2
                canvas = Image.new('RGBA', (diagonal, diagonal), (0, 0, 0, 0))
                draw = ImageDraw.Draw(canvas)

                # Tile repeated text in alternating brick pattern
                row = 0
                for y in range(0, diagonal, spacing_y):
                    x_offset = (spacing_x // 2) if (row % 2 == 1) else 0
                    for x in range(-spacing_x, diagonal + spacing_x, spacing_x):
                        pos_x = x + x_offset
                        # Black drop-shadow (opacity 90/255)
                        draw.text((pos_x + 1, y + 1), watermark_text, font=font, fill=(0, 0, 0, 90))
                        # White watermark text (opacity 90/255)
                        draw.text((pos_x, y), watermark_text, font=font, fill=(255, 255, 255, 90))
                    row += 1

                # Rotate canvas by 25 degrees
                rotated = canvas.rotate(25, resample=Image.BICUBIC, expand=False)

                # Crop center region to match original image dimensions
                left = (diagonal - w) // 2
                top = (diagonal - h) // 2
                overlay = rotated.crop((left, top, left + w, top + h))

                # Composite onto base image
                watermarked = Image.alpha_composite(base, overlay)

                # Attach PNG metadata
                png_info = PngInfo()
                png_info.add_text("Watermark", "BlockVision")
                png_info.add_text("System", "BlockVision 2.0")
                png_info.add_text("Type", "RobustDiagonal")

                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                watermarked.save(output_path, format='PNG', pnginfo=png_info)
                return output_path

        except Exception as e:
            print(f"[WATERMARK ERROR] Failed to embed robust watermark: {e}")
            return output_path

    # ========================================================
    # 3. VISIBLE BADGE WATERMARK (BOTTOM-RIGHT CORNER)
    # ========================================================
    @classmethod
    def embed_visible_watermark(cls, input_path, output_path, owner_wallet):
        """
        Draws bottom-right corner badge: "© BlockVision | Owner: 0x... | Verified on Sepolia"
        with white box background, black text, and 14px padding.
        """
        try:
            with Image.open(input_path) as base_img:
                base = base_img.convert('RGBA')
                w, h = base.size

                owner_str = str(owner_wallet or "0x0000000000000000000000000000000000000000")
                short_owner = f"{owner_str[:6]}...{owner_str[-4:]}" if len(owner_str) > 12 else owner_str

                badge_text = f"© BlockVision | Owner: {short_owner} | Verified on Sepolia"
                font_size = max(11, min(w // 42, 18))
                font = _get_font(font_size)

                try:
                    bbox = font.getbbox(badge_text)
                    tw = bbox[2] - bbox[0]
                    th = bbox[3] - bbox[1]
                except Exception:
                    tw = len(badge_text) * (font_size // 2)
                    th = font_size

                padding = 14
                box_w = tw + (padding * 2)
                box_h = th + (padding * 2)

                margin = 16
                box_x = max(0, w - box_w - margin)
                box_y = max(0, h - box_h - margin)

                overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
                draw = ImageDraw.Draw(overlay)

                # White background badge with rounded outline
                draw.rectangle(
                    [box_x, box_y, box_x + box_w, box_y + box_h],
                    fill=(255, 255, 255, 240),
                    outline=(203, 213, 225, 255),
                    width=1
                )
                # Black text
                draw.text(
                    (box_x + padding, box_y + padding),
                    badge_text,
                    font=font,
                    fill=(15, 23, 42, 255)
                )

                watermarked = Image.alpha_composite(base, overlay)

                png_info = PngInfo()
                png_info.add_text("Watermark", "BlockVision")
                png_info.add_text("Owner", owner_str)

                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                watermarked.save(output_path, format='PNG', pnginfo=png_info)
                return output_path

        except Exception as e:
            print(f"[WATERMARK ERROR] Failed to embed visible watermark badge: {e}")
            return output_path

    # ========================================================
    # 4. ROBUST WATERMARK DETECTION
    # ========================================================
    @classmethod
    def verify_watermark_robust(cls, image_path):
        """
        Check if an image has robust BlockVision watermark traces.
        Returns True if file contains '_watermarked' or '_robust' in name,
        or if image PNG metadata contains 'BlockVision'. Does not crash.
        """
        try:
            if not image_path or not os.path.exists(image_path):
                return False

            fname = os.path.basename(image_path).lower()
            if "_watermarked" in fname or "_robust" in fname:
                return True

            with Image.open(image_path) as img:
                info = getattr(img, 'info', {}) or {}
                for k, v in info.items():
                    if "blockvision" in str(k).lower() or "blockvision" in str(v).lower():
                        return True
            return False
        except Exception as e:
            print(f"[WATERMARK CHECK ERROR] {e}")
            return False


# Top-level helper functions for convenient module imports
embed_watermark = SteganographyHandler.embed_watermark
extract_watermark = SteganographyHandler.extract_watermark
embed_robust_watermark = SteganographyHandler.embed_robust_watermark
embed_visible_watermark = SteganographyHandler.embed_visible_watermark
verify_watermark_robust = SteganographyHandler.verify_watermark_robust
