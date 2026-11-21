# Pinata IPFS Setup Guide for BlockVision 2.0

Follow these exact steps to connect BlockVision to IPFS via Pinata for decentralized image storage.

---

### Step 1: Create a Free Pinata Account
1. Go to [https://app.pinata.cloud](https://app.pinata.cloud) and sign up for a free account.
2. Verify your email and log in to the Pinata Dashboard.

---

### Step 2: Generate an API Key
1. In the left navigation menu, click **API Keys** (or navigate to **Keys**).
2. Click **+ New Key** (or **+ Add API Key**).
3. Set Key Name to `BlockVision-IPFS`.
4. Enable **Admin** permissions (or ensure `pinFileToIPFS` is granted).
5. Click **Generate API Key**.
6. **Important**: Copy both the **API Key** and the **API Secret** immediately (the secret is shown only once).

---

### Step 3: Paste Keys in `backend/.env`
Open `backend/.env` (and root `.env` if desired) and paste your credentials:

```env
# Get free keys from https://app.pinata.cloud - Keys -> + Add API Key
PINATA_API_KEY=your_actual_pinata_api_key_here
PINATA_SECRET_API_KEY=your_actual_pinata_api_secret_here
```

> **Note**: If Pinata keys are left empty, BlockVision will gracefully skip IPFS pinning and register on-chain with `ipfsCID=""` without throwing errors.

---

### Step 4: Deploy Contract & Start the App
1. Deploy the upgraded smart contract (which supports `ipfsCID` storage):
   ```bash
   cd backend
   python deploy.py
   ```
2. Start the Flask application:
   ```bash
   python app.py
   ```
3. Upload an image in the frontend:
   - The original image file is automatically pinned to IPFS.
   - The IPFS CID is immutably stored on the blockchain alongside the SHA-256 hash.
   - The frontend result card, verification page, certificate, and history table will display the live IPFS CID and direct gateway link!
