#!/usr/bin/env python3
"""
Deployment script for ImageVerification smart contract.
Compiles using solc with --evm-version paris (required for Ganache compatibility)
Deploys contract via Web3.py and automatically updates .env
"""
import os
import sys
import json
import shutil
import subprocess
from datetime import datetime
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv, set_key

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
load_dotenv(BACKEND_ENV)
if not os.path.exists(BACKEND_ENV) and os.path.exists(ROOT_ENV):
    load_dotenv(ROOT_ENV)


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
    print("EVM Version: paris (required for Ganache compatibility)")
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


def update_env_file(filepath, node_url, contract_address, private_key):
    """Write/update .env file with essential variables"""
    lines_dict = {
        "ETHEREUM_NODE_URL": node_url,
        "CONTRACT_ADDRESS": contract_address,
        "PRIVATE_KEY": private_key,
        "NETWORK_ID": "5777",
        "FLASK_ENV": "development",
        "FLASK_PORT": "5000",
        "SECRET_KEY": "dev-secret-key-blockvision-2.0",
        "UPLOAD_FOLDER": "uploads",
        "ENCRYPTED_FOLDER": "encrypted",
        "KEYS_FOLDER": "keys",
        "MAX_FILE_SIZE": "16777216",
        "RETENTION_DAYS": "30"
    }

    existing_lines = {}
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line_str = line.strip()
                if line_str and not line_str.startswith("#") and "=" in line_str:
                    k, v = line_str.split("=", 1)
                    existing_lines[k.strip()] = v.strip()

    # Update with new values
    existing_lines.update(lines_dict)

    with open(filepath, "w", encoding="utf-8") as f:
        for k, v in existing_lines.items():
            f.write(f"{k}={v}\n")


def deploy():
    """Main deployment routine"""
    solc_path = find_solc()
    abi, bytecode = compile_contract(solc_path)

    node_url = os.getenv("ETHEREUM_NODE_URL", "http://127.0.0.1:7545")
    w3 = Web3(Web3.HTTPProvider(node_url))

    if not w3.is_connected():
        print(f"\n[ERROR] Cannot connect to Ethereum node at {node_url}")
        print("Please start Ganache on port 7545 and try again.")
        sys.exit(1)

    print(f"\nConnected to Ganache at: {node_url}")
    print(f"Network Chain ID: {w3.eth.chain_id}")

    # Determine deployer private key and account
    private_key = os.getenv("PRIVATE_KEY", "").strip()
    if not private_key:
        # Default Ganache private key or create one
        private_key = "0x8baf991066784ad0b7a6e6a4750ffcb74bc1f9b402f31065939ff21d7f6f5e89"

    account = Account.from_key(private_key)
    account_address = account.address
    balance = w3.eth.get_balance(account_address)

    print(f"Deployer Account: {account_address}")
    print(f"Account Balance: {w3.from_wei(balance, 'ether')} ETH")

    # If balance is low, fund automatically from Ganache default account
    if balance < w3.to_wei(1, "ether") and len(w3.eth.accounts) > 0:
        funding_source = w3.eth.accounts[0]
        print(f"Funding deployer account with 10 ETH from Ganache account {funding_source}...")
        tx = w3.eth.send_transaction({
            "from": funding_source,
            "to": account_address,
            "value": w3.to_wei(10, "ether")
        })
        w3.eth.wait_for_transaction_receipt(tx)
        balance = w3.eth.get_balance(account_address)
        print(f"New Balance: {w3.from_wei(balance, 'ether')} ETH")

    # Deploy contract
    print("\nDeploying ImageVerification contract...")
    contract_factory = w3.eth.contract(abi=abi, bytecode=bytecode)

    nonce = w3.eth.get_transaction_count(account_address)
    gas_price = w3.eth.gas_price

    construct_txn = contract_factory.constructor().build_transaction({
        "from": account_address,
        "nonce": nonce,
        "gas": 3000000,
        "gasPrice": gas_price,
        "chainId": w3.eth.chain_id
    })

    signed = w3.eth.account.sign_transaction(construct_txn, private_key=private_key)
    raw_tx = getattr(signed, "raw_transaction", getattr(signed, "rawTransaction", None))
    tx_hash = w3.eth.send_raw_transaction(raw_tx)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    contract_address = receipt.contractAddress
    print("=" * 60)
    print(f"Deployed at: {contract_address}")
    print(f"Transaction Hash: {tx_hash.hex()}")
    print(f"Block Number: {receipt.blockNumber}")
    print(f"Gas Used: {receipt.gasUsed}")
    print("=" * 60)

    # Save contract address JSON
    with open(ADDRESS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "ImageVerification": contract_address,
            "network": "ganache",
            "deployedAt": datetime.now().isoformat()
        }, f, indent=2)

    # Update .env files
    update_env_file(BACKEND_ENV, node_url, contract_address, private_key)
    update_env_file(ROOT_ENV, node_url, contract_address, private_key)
    print(f"\nAuto-updated CONTRACT_ADDRESS in {BACKEND_ENV} and {ROOT_ENV}")

    return contract_address


if __name__ == "__main__":
    deploy()
