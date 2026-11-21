# BlockVision 2.0 - Live Deployment Guide (Vercel)

This guide documents how to deploy BlockVision 2.0 live on Vercel with a public verification link and QR code scanner support.

---

### Step 1: Commit and Push Code to GitHub
Stage all changes, commit them, and push them to your GitHub repository:
```bash
git add .
git commit -m "Upgrade 5 live deploy"
git push origin main
```

---

### Step 2: Import into Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Select your GitHub repository (`BlockVision_Major_project`).
4. Project Configuration:
   - **Framework Preset**: `Other`
   - **Root Directory**: `.` (leave as root)
5. Click **Deploy**.

---

### Step 3: Add Environment Variables in Vercel
In the Vercel Dashboard, navigate to **Settings** -> **Environment Variables** and add:

| Variable | Description | Example / Source |
|---|---|---|
| `ETHEREUM_NODE_URL` | Sepolia RPC URL | `https://eth-sepolia.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY>` |
| `PRIVATE_KEY` | Relayer / Backend Admin Wallet Key | Your testnet wallet private key (starts with `0x...`) |
| `CONTRACT_ADDRESS` | Deployed ImageVerification Contract | `0x...` (from `python backend/deploy.py`) |
| `CHAIN_ID` | Sepolia Chain ID | `11155111` |
| `SECRET_KEY` | JWT signing secret | 32-character random string |
| `PINATA_API_KEY` | Pinata API Key for IPFS storage | From https://app.pinata.cloud |
| `PINATA_SECRET_API_KEY` | Pinata Secret API Key | From https://app.pinata.cloud |
| `FRONTEND_URL` | Live Vercel Production URL | `https://your-project.vercel.app` |

---

### Step 4: Redeploy
1. Under **Deployments**, click the three dots (`...`) on your latest deployment and select **Redeploy** (or trigger a push to `main`).
2. Wait for the build and deployment to finish.

---

### Step 5: End-to-End Verification Test
1. **Public Verification Without Login**:
   - Open the live URL: `https://<your-project>.vercel.app/verify`.
   - Paste a registered SHA-256 hash or upload an image without connecting MetaMask.
   - Click **Verify Fingerprint**. Verification must succeed and display asset details without requiring authentication.
2. **Mobile QR Code Scanning**:
   - Download or view any generated Certificate PDF on your computer.
   - Scan the QR code located in the bottom-right section with your smartphone camera.
   - It will open `https://<your-project>.vercel.app/verify?hash=<HASH>` and automatically run decentralized verification on the live app.
