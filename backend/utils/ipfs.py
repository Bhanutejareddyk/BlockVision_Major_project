import os
import requests
from dotenv import load_dotenv

# Ensure environment variables are loaded
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(BACKEND_DIR)
BACKEND_ENV = os.path.join(BACKEND_DIR, '.env')
ROOT_ENV = os.path.join(ROOT_DIR, '.env')

if os.path.exists(BACKEND_ENV):
    load_dotenv(BACKEND_ENV)
elif os.path.exists(ROOT_ENV):
    load_dotenv(ROOT_ENV)
else:
    load_dotenv()


def get_ipfs_url(cid):
    """
    Get gateway URL for a given IPFS CID.
    """
    if not cid:
        return ""
    return f"https://gateway.pinata.cloud/ipfs/{cid}"


def upload_to_ipfs(file_path):
    """
    Upload a file to IPFS via Pinata API.
    Returns the IPFS CID string or empty string on failure/missing credentials.
    """
    if not file_path or not os.path.isfile(file_path):
        print(f"[IPFS] Invalid file path for IPFS upload: {file_path}")
        return ""

    pinata_api_key = os.getenv("PINATA_API_KEY", "").strip()
    pinata_secret_api_key = os.getenv("PINATA_SECRET_API_KEY", "").strip()

    if not pinata_api_key or not pinata_secret_api_key:
        print("WARNING: Pinata keys missing, skipping IPFS upload")
        return ""

    url = "https://api.pinata.cloud/pinning/pinFileToIPFS"
    headers = {
        "pinata_api_key": pinata_api_key,
        "pinata_secret_api_key": pinata_secret_api_key
    }

    try:
        filename = os.path.basename(file_path)
        with open(file_path, "rb") as f:
            files = {
                "file": (filename, f)
            }
            response = requests.post(url, files=files, headers=headers, timeout=10)

        if response.status_code == 200:
            res_json = response.json()
            cid = res_json.get("IpfsHash", "")
            print(f"[IPFS] Successfully pinned file to IPFS. CID: {cid}")
            return cid
        else:
            print(f"[IPFS] Pinata upload failed with status {response.status_code}: {response.text}")
            return ""

    except requests.exceptions.Timeout:
        print("[IPFS] Pinata upload timed out after 10 seconds. Continuing without blocking.")
        return ""
    except Exception as e:
        print(f"[IPFS] Error uploading to Pinata: {str(e)}. Continuing without blocking.")
        return ""
