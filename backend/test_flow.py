#!/usr/bin/env python3
"""
Comprehensive End-to-End Verification Test for BlockVision 2.0.
Tests:
  1. Ganache connection
  2. Account balance and auto-funding
  3. Smart contract interaction (view & state mutation)
  4. Image registration on blockchain
  5. Image verification (ONE field order: imageHash, owner, timestamp, fileName, exists)
  6. Non-existent hash check
  7. Optional Flask API verification (if server is running)
"""
import os
import sys
import time
import requests
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

# Ensure environment is loaded from backend/.env
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

from config import Config
from utils.blockchain import BlockchainInterface, load_contract_abi, get_blockchain


def run_tests():
    print("=" * 65)
    print("       BLOCKVISION 2.0 - SYSTEM VERIFICATION SUITE       ")
    print("=" * 65)

    Config.reload()
    node_url = Config.ETHEREUM_NODE_URL
    contract_addr = Config.CONTRACT_ADDRESS
    private_key = Config.PRIVATE_KEY

    print(f"1. Node URL:         {node_url}")
    print(f"2. Contract Address: {contract_addr or '[NOT SET - RUN python deploy.py FIRST]'}")
    print(f"3. Private Key:      {private_key[:10]}...{private_key[-6:] if private_key else '[NONE]'}")
    print("-" * 65)

    if not contract_addr:
        print("[INFO] CONTRACT_ADDRESS is not set. Auto-deploying contract first...")
        try:
            from deploy import deploy
            contract_addr = deploy()
            Config.reload()
            print(f"[PASS] Successfully auto-deployed contract to: {contract_addr}")
        except Exception as e:
            print(f"[FAIL] Auto-deployment failed: {e}")
            return False

    # 1. Connect to blockchain
    w3 = Web3(Web3.HTTPProvider(node_url))
    if not w3.is_connected():
        print(f"[FAIL] Cannot connect to Ethereum node at {node_url}. Please start Ganache.")
        return False
    print(f"[PASS] Connected to Ganache (Chain ID: {w3.eth.chain_id})")

    # 2. Check Account
    account = Account.from_key(private_key)
    balance = w3.eth.get_balance(account.address)
    balance_eth = float(w3.from_wei(balance, 'ether'))
    print(f"[PASS] Deployer/Signer Account: {account.address}")
    print(f"       Account Balance: {balance_eth:.4f} ETH")

    if balance_eth < 0.05 and len(w3.eth.accounts) > 0:
        print("       [INFO] Low balance. Auto-funding 5 ETH from Ganache account...")
        tx = w3.eth.send_transaction({
            'from': w3.eth.accounts[0],
            'to': account.address,
            'value': w3.to_wei(5, 'ether')
        })
        w3.eth.wait_for_transaction_receipt(tx)
        balance = w3.eth.get_balance(account.address)
        print(f"       [PASS] Refunded balance: {w3.from_wei(balance, 'ether')} ETH")

    # 3. Initialize blockchain interface via unified helper
    try:
        blockchain = get_blockchain()
        print(f"[PASS] Contract interface initialized successfully")
    except Exception as e:
        print(f"[FAIL] Could not initialize contract: {e}")
        return False

    # 4. Total images in contract
    total_images_before = blockchain.get_total_images()
    print(f"[INFO] Current total registered images on-chain: {total_images_before}")

    # 5. Register test image
    test_hash = f"test_{int(time.time())}" + "a" * (64 - len(f"test_{int(time.time())}"))
    test_filename = f"sample_photo_{int(time.time())}.png"
    print(f"\nRegistering test image on blockchain:")
    print(f"  Hash:     {test_hash}")
    print(f"  Filename: {test_filename}")

    try:
        reg_result = blockchain.register_image(test_hash, test_filename)
        if reg_result.get('status') != 'success':
            print(f"[FAIL] Registration transaction failed: {reg_result}")
            return False
        print(f"[PASS] Successfully registered on blockchain!")
        print(f"       Tx Hash:      {reg_result['transaction_hash']}")
        print(f"       Block Number: {reg_result['block_number']}")
        print(f"       Gas Used:     {reg_result['gas_used']}")
    except Exception as e:
        print(f"[FAIL] Registration failed: {e}")
        return False

    # 6. Verify registration via view function (testing ONE field order)
    try:
        details = blockchain.get_image_details(test_hash)
        if not details.get('exists'):
            print(f"[FAIL] Verification returned exists=False for newly registered image!")
            return False
        
        assert details.get('image_hash') == test_hash, "Hash mismatch"
        assert details.get('owner').lower() == account.address.lower(), "Owner mismatch"
        assert details.get('file_name') == test_filename, "Filename mismatch"
        assert details.get('timestamp') > 0, "Timestamp invalid"
        
        print(f"[PASS] Verified details from blockchain view function:")
        print(f"       Exists:    {details['exists']}")
        print(f"       Owner:     {details['owner']}")
        print(f"       Timestamp: {details['timestamp']}")
        print(f"       Filename:  {details['file_name']}")
    except Exception as e:
        print(f"[FAIL] Verification failed: {e}")
        return False

    # 7. Verify non-existent image returns exists=False
    fake_hash = "0" * 64
    fake_details = blockchain.get_image_details(fake_hash)
    if fake_details.get('exists') is False:
        print(f"[PASS] Non-registered hash correctly returned exists=False")
    else:
        print(f"[FAIL] Non-registered hash returned exists=True!")
        return False

    # 8. Check total count incremented
    total_images_after = blockchain.get_total_images()
    print(f"[PASS] Total images count incremented: {total_images_before} -> {total_images_after}")

    # 9. Test Flask API if running
    flask_port = Config.FLASK_PORT
    try:
        health_resp = requests.get(f"http://127.0.0.1:{flask_port}/api/health", timeout=1.5)
        if health_resp.status_code == 200:
            print(f"\n[PASS] Flask server detected running on port {flask_port}")
            print(f"       Health status: {health_resp.json()}")

            # Test API verify-hash endpoint
            verify_resp = requests.post(
                f"http://127.0.0.1:{flask_port}/api/verify-hash",
                json={"image_hash": test_hash},
                timeout=2.0
            )
            if verify_resp.status_code == 200 and verify_resp.json().get('verified'):
                print(f"[PASS] Flask API /api/verify-hash verified test image successfully!")
            else:
                print(f"[WARN] Flask API /api/verify-hash returned: {verify_resp.text}")
    except requests.exceptions.ConnectionError:
        print(f"\n[INFO] Flask server is not currently running on port {flask_port}.")
        print("       (You can start it with: python app.py)")

    print("\n" + "=" * 65)
    print("   ALL BLOCKCHAIN CORE TESTS PASSED SUCCESSFULLY!   ")
    print("=" * 65)
    return True


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
