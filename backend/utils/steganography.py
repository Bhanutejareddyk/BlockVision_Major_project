import os
from PIL import Image


class SteganographyHandler:
    """
    LSB (Least Significant Bit) steganography for embedding and extracting
    blockchain transaction hashes or provenance markers invisibly into images.
    """

    DELIMITER = "##END_BLOCKVISION##"

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
