# BlockVision-2.0 - Blockchain Image Verification

[![Live Demo](https://img.shields.io/badge/Live%20Demo-blockvision--nu.vercel.app-0070f3?style=for-the-badge&logo=vercel)](https://blockvision-nu.vercel.app)
[![Network](https://img.shields.io/badge/Blockchain-Ethereum%20Sepolia-627eea?style=for-the-badge&logo=ethereum)](https://sepolia.etherscan.io)
[![Storage](https://img.shields.io/badge/Storage-IPFS%20Pinata-00d1b2?style=for-the-badge&logo=ipfs)](https://pinata.cloud)
[![Authentication](https://img.shields.io/badge/Auth-MetaMask%20EIP--4361-f6851b?style=for-the-badge&logo=metamask)](https://metamask.io)

> **Major Project Submission**  
> **Student Author:** Bhanu Tej Reddy K.  
> **Repository:** [https://github.com/Bhanutejareddyk/BlockVision_Major_project](https://github.com/Bhanutejareddyk/BlockVision_Major_project)  
> **Live Production:** [https://blockvision-nu.vercel.app](https://blockvision-nu.vercel.app)

---

## 📌 Executive Summary

**BlockVision-2.0** is an enterprise-grade digital media provenance and authenticity assurance platform. By fusing **Ethereum smart contracts**, **IPFS decentralized content addressing**, **cryptographic personal signature authentication (EIP-712/EIP-4361)**, **dual-layer perceptual difference analysis (dHash & Hamming Heatmaps)**, and **tamper-resilient watermarking**, BlockVision-2.0 solves the vulnerability of unauthorized media tampering, copyright theft, and silent image spoofing.

---

## 🚀 Evolutionary Engineering: Upgrades #1 through #8

- **Upgrade #1: Sepolia Ethereum Testnet Migration**
  - Native integration with Ethereum Sepolia testnet via Infura/Alchemy RPC endpoints.
  - Deployed `ImageVerification.sol` contract (`0x2334f06Ca3247c88Fc6D169122956ccD0aE5eD9f`) with real gas management and Etherscan transaction tracking.
  - Backward-compatible `LocalLedger` fallback mode when RPC connectivity is offline.

- **Upgrade #2: Decentralized Storage via IPFS & Pinata**
  - High-res images are automatically pinned to IPFS upon registration via the Pinata REST API.
  - The content-addressed CID (`ipfsCID`) is permanently committed on-chain within the smart contract struct.
  - Instant decentralized preview gateways across certificates, history, and verification views.

- **Upgrade #3: True User Authentication & Wallet Login**
  - Cryptographic challenge-response authentication using MetaMask `personal_sign` and nonces.
  - Eliminates centralized admin ownership: each user's MetaMask address is recorded on-chain as the true `owner` via `registerImageFor`.
  - JWT session issuance for seamless frontend interaction without recurring signature prompts.

- **Upgrade #4: Asset Revocation & Duplicate / Near-Duplicate Detection**
  - Smart contract `revokeImage(string memory _imageHash)` function callable exclusively by the verified owner.
  - Revocation flag (`isRevoked`) propagates across certificates, audit reports, and tables.
  - Perceptual difference hashing (`dHash`) scans existing records to prevent 95%+ near-duplicate re-registration attempts.

- **Upgrade #5: Cloud Production Deployment & Global Public Verification**
  - Full-stack production deployment on Vercel Serverless (`@vercel/python` and `@vercel/static`).
  - Dynamic QR codes on certificates directly resolve to public URLs (`https://blockvision-nu.vercel.app/verify?hash=...`) that allow unauthenticated auditors to verify certificates from any smartphone or browser.

- **Upgrade #6: Robust Anti-Tamper Watermarking & Heatmap Diff**
  - Anti-tamper watermark engine embedding repeated diagonal semi-transparent provenance text and owner addresses across images.
  - Visual tamper heatmap generator computing exact pixel-level differential matrices when a modified image is analyzed against registered records.
  - Backward-compatible LSB steganographic watermarking preserved.

- **Upgrade #7: On-Chain Ownership Transfer & Wallet + Guest ID Login**
  - Smart contract `transferOwnership(string memory _imageHash, address _newOwner)` enabling secondary-market transfers.
  - Tracks `previousOwner` provenance lineage across transactions and certificate audits.
  - Wallet + Guest ID login system with persistent custodial account derivation and full mobile support.

- **Upgrade #8 (Final): High-Throughput Batch Processing & Executive Analytics Dashboard**
  - Multi-file parallel batch upload (`POST /api/batch-upload`) and atomic batch registration (`POST /api/batch-register`) for up to 10 images simultaneously.
  - Public `/api/stats` and authenticated `/api/dashboard` analytics engine.
  - Comprehensive Executive Dashboard (`/dashboard`) presenting global network statistics, recent provenance logs, and personal wallet portfolios.

---

## 🛠 Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend UI** | HTML5, CSS3, Modern JS (ES6+) | Apple-inspired responsive interface with light/dark theme |
| **Backend Server** | Python 3.12+, Flask, Werkzeug | RESTful API server with thread-pool background execution |
| **Smart Contracts** | Solidity 0.8.0+ (`--evm-version paris`) | EVM immutable registry tracking hashes, owners, CIDs, revocation |
| **Blockchain Network** | Ethereum Sepolia Testnet | Decentralized public test network with Etherscan transparency |
| **Decentralized Storage** | IPFS (Pinata API & Gateway) | Content-addressed immutable file storage |
| **Authentication** | EIP-191 `personal_sign` + PyJWT | Web3 wallet challenge-response authentication with JWT sessions |
| **Image Analysis** | Pillow (PIL), NumPy, dHash | SHA-256 cryptographic hashing & 64-bit perceptual visual fingerprinting |
| **Deployment** | Vercel Serverless Architecture | Global CDN static hosting + serverless Python runtime |

---

## 💻 Local Development & Setup

### Prerequisites
- Python 3.8+ (tested up to 3.13)
- Git
- Google Chrome or Firefox with MetaMask extension

### Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Bhanutejareddyk/BlockVision_Major_project.git
   cd BlockVision_Major_project
   ```

2. **Set Up Python Environment**:
   ```bash
   cd backend
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate

   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your credentials:
   ```env
   PRIVATE_KEY=your_sepolia_private_key
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
   CONTRACT_ADDRESS=0x2334f06Ca3247c88Fc6D169122956ccD0aE5eD9f
   PINATA_API_KEY=your_pinata_key
   PINATA_SECRET_API_KEY=your_pinata_secret
   PINATA_JWT=your_pinata_jwt
   SECRET_KEY=blockvision-super-secret-jwt-key
   ```

4. **Deploy / Verify Smart Contract (Optional)**:
   ```bash
   python deploy.py
   ```

5. **Start Flask Server**:
   ```bash
   python app.py
   ```
   Open your browser to: `http://127.0.0.1:5000`

---

## 🔍 How to Test & Verify the System (Viva Demonstration)

1. **Connect MetaMask**:
   - Open [https://blockvision-nu.vercel.app](https://blockvision-nu.vercel.app) (or `http://127.0.0.1:5000`).
   - Click **Connect Wallet** in the top navigation. Sign the cryptographic login challenge in MetaMask.
2. **Single Upload**:
   - Navigate to `/upload`. Select an image. Click **Continue**, then **Save to Blockchain**.
   - Download the generated PDF certificate with embedded QR code.
3. **Batch Mode Upload**:
   - Toggle **Batch Mode (up to 10 images)** on `/upload`.
   - Select multiple photos at once. Click **Upload & Register Batch**.
   - Watch real-time batch processing and inspect the summary table with green active badges.
4. **Public Verification & QR Audit**:
   - Open `/verify`. Upload the saved certificate image or paste its SHA-256 fingerprint.
   - Click **Check Photo**. Review the 100% cryptographic match, IPFS link, and Sepolia timestamp.
5. **Tamper Detection & Heatmap**:
   - Crop or edit 1 pixel of your registered photo.
   - Upload the modified file to `/verify`. Observe the **SIMILAR - POSSIBLE TAMPERED COPY** warning and visual differential heatmap.
6. **Executive Dashboard**:
   - Open `/dashboard`. Review the 4 global metric cards, your personal wallet portfolio, and recent registrations.

---

## 📂 Project Structure

```
BlockVision_Major_project/
├── .gitignore
├── README.md                           # Comprehensive documentation & Viva guide
├── vercel.json                         # Vercel deployment routing configuration
├── requirements.txt                    # Root dependency definitions
├── api/
│   └── index.py                        # Vercel serverless Python entrypoint
├── backend/
│   ├── app.py                          # Flask application core & route registration
│   ├── config.py                       # Environment configuration & fallbacks
│   ├── deploy.py                       # Sepolia smart contract deployment automation
│   ├── requirements.txt                # Backend dependencies
│   ├── contracts/
│   │   ├── ImageVerification.sol       # Solidity smart contract
│   │   └── compiled/
│   │       ├── ImageVerification.abi   # Contract ABI interface
│   │       └── ImageVerification.bin   # Contract EVM bytecode
│   ├── routes/
│   │   ├── upload.py                   # Upload, batch-upload, transfer, revoke routes
│   │   ├── verify.py                   # Verification, tamper heatmap, hash check
│   │   └── history.py                  # Stats, dashboard, user image history
│   └── utils/
│       ├── auth.py                     # MetaMask personal_sign challenge & JWT handler
│       ├── guest_wallets.py            # Reusable Guest ID generator & custodial wallet
│       ├── blockchain.py               # Web3.py Sepolia RPC wrapper
│       ├── local_ledger.py             # Offline blockchain simulator fallback
│       ├── encryption.py               # AES-256 file encryption engine
│       ├── hashing.py                  # SHA-256 and dHash perceptual algorithms
│       ├── image_handler.py            # File integrity, dimensions, sanitization
│       ├── ipfs.py                     # Pinata IPFS pinning and gateway resolver
│       ├── similarity.py               # Hamming distance near-duplicate detector
│       └── steganography.py            # Anti-tamper & robust watermark generators
├── frontend/                           # Source client assets (mirrored to public/)
│   ├── index.html                      # Landing page
│   ├── upload.html                     # Single & batch upload interface
│   ├── verify.html                     # Cryptographic verification & tamper check
│   ├── history.html                    # All registered asset ledger
│   ├── dashboard.html                  # Executive analytics dashboard
│   ├── css/                            # Apple-aesthetic design system
│   └── js/
│       ├── auth.js                     # MetaMask wallet connector & session keeper
│       ├── certificate.js              # Client-side PDF certificate generator
│       ├── dashboard.js                # Dashboard metrics & portfolio visualizer
│       ├── history.js                  # History pagination, revocation & transfer
│       ├── main.js                     # Global API client & toast notifications
│       ├── upload.js                   # Single & batch upload event handler
│       └── verify.js                   # Verification & QR handler
└── public/                             # Vercel CDN production static files
```

---

## 📸 Screenshots

| Landing Page | Executive Dashboard |
| :---: | :---: |
| *(Hero landing with wallet authentication)* | *(Real-time Sepolia metrics & recent registrations)* |

| Batch Upload Interface | Audit Certificate |
| :---: | :---: |
| *(Simultaneous multi-asset registration)* | *(High-res PDF proof with QR verification)* |

---

## 🎓 Academic Major Project Credits

- **Student:** Bhanu Tej Reddy K.
- **Project Title:** BlockVision-2.0: Decentralized Image Provenance and Cryptographic Verification Architecture
- **Academic Year:** 2026
