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


def update_env_variable(filepath, key, value):
    """Update or append an environment variable in given .env file while preserving comments"""
    if not os.path.exists(filepath):
        return
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    pattern = rf"^{re.escape(key)}=.*$"
    if re.search(pattern, content, flags=re.MULTILINE):
        new_content = re.sub(pattern, f"{key}={value}", content, flags=re.MULTILINE)
    else:
        new_content = content.rstrip() + f"\n{key}={value}\n"

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_content)


def update_env_contract_address(filepath, contract_address):
    """Update CONTRACT_ADDRESS in given .env file while preserving comments and structure"""
    update_env_variable(filepath, "CONTRACT_ADDRESS", contract_address)


def deploy():
    """Main deployment routine supporting Ganache Local and Sepolia Testnet"""
    node_url = os.getenv("ETHEREUM_NODE_URL", "").strip()

    # Expand ${ALCHEMY_API_KEY} template variable if present
    if "${ALCHEMY_API_KEY}" in node_url:
        alchemy_key = os.getenv("ALCHEMY_API_KEY", "").strip()
        if alchemy_key and alchemy_key != "YOUR_ALCHEMY_API_KEY":
            node_url = node_url.replace("${ALCHEMY_API_KEY}", alchemy_key)
        else:
            # Template variable without actual key - check local node
            node_url = ""

    # Check if node_url is valid, or fallback to Ganache / localhost
    candidates = []
    if node_url and not node_url.endswith("/v2/") and not node_url.endswith("/v2"):
        candidates.append(node_url)
    candidates.extend(["http://127.0.0.1:7545", "http://127.0.0.1:8545", "http://localhost:7545", "http://localhost:8545"])

    w3 = None
    connected_url = None
    for candidate in candidates:
        try:
            test_w3 = Web3(Web3.HTTPProvider(candidate, request_kwargs={"timeout": 5}))
            if test_w3.is_connected():
                w3 = test_w3
                connected_url = candidate
                break
        except Exception:
            continue

    if not w3 or not connected_url:
        print("\n[ERROR] Cannot connect to any Ethereum node.")
        print("Please start Ganache on port 7545, or configure a valid Sepolia RPC URL in .env.")
        sys.exit(1)

    is_local = "127.0.0.1" in connected_url or "localhost" in connected_url or "7545" in connected_url or "8545" in connected_url
    network_name = "Ganache / Localhost" if is_local else "Sepolia / Remote Testnet"
    chain_id = w3.eth.chain_id

    print(f"\nConnected to {network_name} at: {connected_url}")
    print(f"Network Chain ID: {chain_id}")

    # Compile contract
    solc_path = find_solc()
    abi, bytecode = compile_contract(solc_path)

    # Determine deployer private key and account
    private_key = os.getenv("PRIVATE_KEY", "").strip()
    if not private_key:
        private_key = "0x8baf991066784ad0b7a6e6a4750ffcb74bc1f9b402f31065939ff21d7f6f5e89"

    if not private_key.startswith("0x"):
        private_key = "0x" + private_key

    account = Account.from_key(private_key)
    account_address = account.address
    balance = w3.eth.get_balance(account_address)

    print(f"Deployer Account: {account_address}")
    print(f"Account Balance: {w3.from_wei(balance, 'ether')} ETH")

    # If on local network and balance is low, auto-fund from first Ganache account
    if is_local and balance < w3.to_wei(1, "ether") and len(w3.eth.accounts) > 0:
        funding_source = w3.eth.accounts[0]
        print(f"Funding deployer account with 10 ETH from local account {funding_source}...")
        try:
            tx = w3.eth.send_transaction({
                "from": funding_source,
                "to": account_address,
                "value": w3.to_wei(10, "ether")
            })
            w3.eth.wait_for_transaction_receipt(tx)
            balance = w3.eth.get_balance(account_address)
            print(f"New Balance: {w3.from_wei(balance, 'ether')} ETH")
        except Exception as fe:
            print(f"[WARN] Auto-funding failed: {fe}")

    if balance == 0:
        print(f"\n[ERROR] Account {account_address} has 0 ETH on {connected_url}.")
        print("Please fund this account before deploying.")
        sys.exit(1)

    # Deploy contract
    print(f"\nDeploying ImageVerification contract to {network_name}...")
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
    print("Waiting for transaction confirmation...")

    receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    contract_address = receipt.contractAddress

    print("=" * 60)
    print(f"Deployed at: {contract_address}")
    if not is_local:
        print(f"Verify on: https://sepolia.etherscan.io/address/{contract_address}")
        print(f"Verify Tx on: https://sepolia.etherscan.io/tx/{tx_hash.hex()}")
    print(f"Transaction Hash: {tx_hash.hex()}")
    print(f"Block Number: {receipt.blockNumber}")
    print(f"Gas Used: {receipt.gasUsed}")
    print("=" * 60)

    # Save contract address JSON
    os.makedirs(COMPILED_DIR, exist_ok=True)
    with open(ADDRESS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump({
            "ImageVerification": contract_address,
            "network": "local" if is_local else "sepolia",
            "chainId": chain_id,
            "deployedAt": datetime.now().isoformat()
        }, f, indent=2)

    # Auto-update .env files
    for env_file in [BACKEND_ENV, ROOT_ENV]:
        if os.path.exists(env_file):
            update_env_variable(env_file, "CONTRACT_ADDRESS", contract_address)
            update_env_variable(env_file, "CHAIN_ID", str(chain_id))
            update_env_variable(env_file, "NETWORK_ID", str(chain_id))
            if is_local:
                update_env_variable(env_file, "ETHEREUM_NODE_URL", connected_url)
    print(f"\nAuto-updated CONTRACT_ADDRESS in .env ({contract_address})")

    return contract_address


if __name__ == "__main__":
    deploy()
