#!/usr/bin/env python3
"""
Deployment script for ImageVerification smart contract on Sepolia Testnet.
Compiles using solc with --evm-version paris
Deploys contract via Web3.py and automatically updates .env with new CONTRACT_ADDRESS
"""
import os
import sys
import re
import json
import shutil
import subprocess
from datetime import datetime
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# Paths
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BACKEND_DIR)
CONTRACT_REL_PATH = os.path.join("contracts", "ImageVerification.sol")
CONTRACT_FULL_PATH = os.path.join(BACKEND_DIR, CONTRACT_REL_PATH)
COMPILED_DIR = os.path.join(BACKEND_DIR, "contracts", "compiled")
ABI_PATH = os.path.join(COMPILED_DIR, "ImageVerification.abi")
ADDRESS_JSON_PATH = os.path.join(COMPILED_DIR, "contract-address.json")

# Environment files
BACKEND_ENV = os.path.join(BACKEND_DIR, ".env")
ROOT_ENV = os.path.join(ROOT_DIR, ".env")

# Ensure .env is loaded
load_dotenv(BACKEND_ENV, override=True)
if not os.path.exists(BACKEND_ENV) and os.path.exists(ROOT_ENV):
    load_dotenv(ROOT_ENV, override=True)


def find_solc():
    """Locate solc.exe binary"""
    candidates = [
        os.path.join(BACKEND_DIR, "solc.exe"),
        shutil.which("solc.exe"),
        shutil.which("solc"),
        os.path.expanduser(r"~/.solcx/solc-v0.8.19.exe"),
        os.path.expanduser(r"~\AppData\Local\hardhat-nodejs\Cache\compilers-v2\windows-amd64\solc-windows-amd64-v0.8.19+commit.7dd6d404.exe"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return "solc.exe"


def compile_contract(solc_path):
    """Compile contract using solc with --evm-version paris"""
    print("=" * 60)
    print("COMPILING SMART CONTRACT")
    print(f"Contract: {CONTRACT_FULL_PATH}")
    print(f"Compiler: {solc_path}")
    print("EVM Version: paris (required for EVM compatibility)")
    print("=" * 60)

    if not os.path.exists(CONTRACT_FULL_PATH):
        raise FileNotFoundError(f"Contract file not found at: {CONTRACT_FULL_PATH}")

    os.makedirs(COMPILED_DIR, exist_ok=True)

    cmd = [
        solc_path,
        "--evm-version", "paris",
        "--combined-json", "abi,bin",
        "contracts/ImageVerification.sol"
    ]

    result = subprocess.run(cmd, cwd=BACKEND_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Compilation error:\n{result.stderr}")
        raise RuntimeError(f"solc compilation failed with code {result.returncode}")

    data = json.loads(result.stdout)
    contract_key = "contracts/ImageVerification.sol:ImageVerification"
    if contract_key not in data.get("contracts", {}):
        # Fallback search for any ImageVerification key
        for k in data.get("contracts", {}):
            if "ImageVerification" in k:
                contract_key = k
                break

    contract_info = data["contracts"][contract_key]
    abi = contract_info["abi"]
    if isinstance(abi, str):
        abi = json.loads(abi)
    bytecode = contract_info["bin"]

    # Save ABI file
    with open(ABI_PATH, "w", encoding="utf-8") as f:
        json.dump(abi, f, indent=2)
    print(f"Contract ABI saved to: {ABI_PATH}")

    return abi, bytecode


def update_env_contract_address(filepath, contract_address):
    """Update CONTRACT_ADDRESS in given .env file while preserving comments and structure"""
    if not os.path.exists(filepath):
        return
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    if re.search(r"^CONTRACT_ADDRESS=.*$", content, flags=re.MULTILINE):
        new_content = re.sub(r"^CONTRACT_ADDRESS=.*$", f"CONTRACT_ADDRESS={contract_address}", content, flags=re.MULTILINE)
    else:
        new_content = content.rstrip() + f"\nCONTRACT_ADDRESS={contract_address}\n"

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)


def deploy():
    """Main deployment routine for Sepolia Testnet"""
    node_url = os.getenv("ETHEREUM_NODE_URL", "").strip()

    # Step Check: Ensure we are not on Ganache / localhost
    if not node_url or "127.0.0.1" in node_url or "localhost" in node_url or "7545" in node_url:
        print("ERROR: Still on Ganache, update .env to Sepolia")
        sys.exit(1)

    # Expand ${ALCHEMY_API_KEY} template variable if present
    if "${ALCHEMY_API_KEY}" in node_url:
        alchemy_key = os.getenv("ALCHEMY_API_KEY", "").strip()
        if alchemy_key and alchemy_key != "YOUR_ALCHEMY_API_KEY":
            node_url = node_url.replace("${ALCHEMY_API_KEY}", alchemy_key)

    if node_url.endswith("/v2/") or node_url.endswith("/v2") or "${ALCHEMY_API_KEY}" in node_url:
        print("ERROR: Alchemy Sepolia API Key missing in .env.")
        print("Please replace ${ALCHEMY_API_KEY} in backend/.env with your Alchemy API key from https://dashboard.alchemy.com")
        sys.exit(1)

    chain_id = int(os.getenv("CHAIN_ID", "11155111"))

    # Connect to Web3 provider
    w3 = Web3(Web3.HTTPProvider(node_url, request_kwargs={"timeout": 60}))

    if not w3.is_connected():
        print(f"\n[ERROR] Cannot connect to Ethereum node at {node_url}")
        print("Please check your internet connection and verify your Alchemy Sepolia URL in .env.")
        sys.exit(1)

    print(f"\nConnected to Sepolia Node at: {node_url}")
    print(f"Network Chain ID: {chain_id}")

    # Compile contract
    solc_path = find_solc()
    abi, bytecode = compile_contract(solc_path)

    # Determine deployer private key and account
    private_key = os.getenv("PRIVATE_KEY", "").strip()
    if not private_key:
        print("[ERROR] PRIVATE_KEY is not defined in .env")
        sys.exit(1)

    account = Account.from_key(private_key)
    account_address = account.address
    balance = w3.eth.get_balance(account_address)

    print(f"Deployer Account: {account_address}")
    print(f"Account Balance: {w3.from_wei(balance, 'ether')} SepoliaETH")

    if balance == 0:
        print(f"\n[ERROR] Account {account_address} has 0 SepoliaETH.")
        print("Please get free SepoliaETH from https://sepoliafaucet.com or https://alchemy.com/faucets/ethereum-sepolia")
        sys.exit(1)

    # Deploy contract
    print("\nDeploying ImageVerification contract to Sepolia Testnet...")
    contract_factory = w3.eth.contract(abi=abi, bytecode=bytecode)

    nonce = w3.eth.get_transaction_count(account_address)
    gas_price = w3.eth.gas_price

    construct_txn = contract_factory.constructor().build_transaction({
        "from": account_address,
        "nonce": nonce,
        "gas": 3000000,
        "gasPrice": gas_price,
        "chainId": chain_id
    })

    signed = w3.eth.account.sign_transaction(construct_txn, private_key=private_key)
    raw_tx = getattr(signed, "raw_transaction", getattr(signed, "rawTransaction", None))
    tx_hash = w3.eth.send_raw_transaction(raw_tx)

    print(f"Transaction submitted: {tx_hash.hex()}")
    print("Waiting for transaction confirmation on Sepolia (this typically takes 10-20 seconds)...")

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    contract_address = receipt.contractAddress

    print("=" * 60)
    print(f"Deployed at: {contract_address}")
    print(f"Verify on: https://sepolia.etherscan.io/address/{contract_address}")
    print(f"Transaction Hash: {tx_hash.hex()}")
    print(f"Verify Tx on: https://sepolia.etherscan.io/tx/{tx_hash.hex()}")
    print(f"Block Number: {receipt.blockNumber}")
    print(f"Gas Used: {receipt.gasUsed}")
    print("=" * 60)

    # Save contract address JSON
    with open(ADDRESS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "ImageVerification": contract_address,
            "network": "sepolia",
            "chainId": chain_id,
            "deployedAt": datetime.now().isoformat()
        }, f, indent=2)

    # Auto-update CONTRACT_ADDRESS in .env files
    update_env_contract_address(BACKEND_ENV, contract_address)
    if os.path.exists(ROOT_ENV):
        update_env_contract_address(ROOT_ENV, contract_address)
    print(f"\nAuto-updated CONTRACT_ADDRESS in {BACKEND_ENV}")

    return contract_address


if __name__ == "__main__":
    deploy()
