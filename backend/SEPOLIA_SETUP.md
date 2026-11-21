# Sepolia Testnet Setup & Deployment Guide for BlockVision 2.0

Follow these exact steps to configure and deploy the BlockVision smart contract to the Ethereum Sepolia Testnet.

---

### Step 1: Create App at Alchemy
1. Go to [https://dashboard.alchemy.com](https://dashboard.alchemy.com) and sign in or sign up.
2. In the Alchemy Dashboard, click **Create new app**.
3. Set the chain to **Ethereum** and the network to **Ethereum Sepolia**.
4. Once created, click **API Key** and copy your **HTTPS URL** (format: `https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY`).

---

### Step 2: Get SepoliaETH from Faucet
1. Visit the faucet at [https://sepoliafaucet.com](https://sepoliafaucet.com) (or [https://alchemy.com/faucets/ethereum-sepolia](https://alchemy.com/faucets/ethereum-sepolia)).
2. Request free testnet SepoliaETH for your wallet address:
   ```text
   0x2334f06Ca3247c88Fc6D169122956ccD0aE5eD9f
   ```
3. Wait ~1-2 minutes for the faucet transaction to confirm on-chain.

---

### Step 3: Paste Key in `.env`
1. Open `backend/.env` (and root `.env` if desired).
2. Set your Alchemy HTTPS RPC URL:
   ```env
   # Get Alchemy key from https://dashboard.alchemy.com and SepoliaETH from https://sepoliafaucet.com
   ETHEREUM_NODE_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ACTUAL_ALCHEMY_API_KEY
   CHAIN_ID=11155111
   CONTRACT_ADDRESS=
   PRIVATE_KEY=0x8baf991066784ad0b7a6e6a4750ffcb74bc1f9b402f31065939ff21d7f6f5e89
   ```

---

### Step 4: Run Smart Contract Deployment
Open your terminal in the backend directory and run:
```bash
cd backend
python deploy.py
```
The script will:
- Verify that your RPC is pointing to Sepolia (not Ganache/localhost).
- Check your deployer account balance on Sepolia.
- Compile the smart contract with `solc --evm-version paris`.
- Submit the deployment transaction to Sepolia and wait for confirmation (~10-15 seconds).
- Output:
  ```text
  Deployed at: 0x...
  Verify on: https://sepolia.etherscan.io/address/<address>
  ```
- Automatically update `CONTRACT_ADDRESS` in `backend/.env`.

---

### Step 5: Check on Sepolia Etherscan
1. Open your deployed contract address directly in your browser:
   ```text
   https://sepolia.etherscan.io/address/<contractAddress>
   ```
2. Verify the contract creation transaction status is **Success**.
3. Start the application:
   ```bash
   python app.py
   ```
4. Upload an image in the frontend. Registration will execute on Sepolia in 10-15 seconds and provide live Etherscan links for both the transaction and the certificate!
