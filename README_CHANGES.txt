====================================================================================================
                        BLOCKVISION 2.0 - CHANGELOG & AUDIT LOG
====================================================================================================
Project Name:       BlockVision 2.0 (Blockchain-Based Image Verification System)
Author / Owner:     Bhanu's Major Project
Date of Execution:  November 20, 2026
Timestamp:          2026-11-20 20:42:00 IST
Encoding:           UTF-8 (Strictly without BOM / No ï»¿)
EVM Compatibility:  Paris (Ganache 2.7.1 compatible, PUSH0/Shanghai disabled)
====================================================================================================

----------------------------------------------------------------------------------------------------
[1] EXECUTIVE SUMMARY
----------------------------------------------------------------------------------------------------
All 13 critical system bugs, compile mismatches, EVM opcode incompatibilities, Windows file-lock
issues, and frontend wallet blockers have been fully resolved. The project was retained in its
original structure and naming without breaking backwards compatibility.

In addition, advanced major project enhancements were seamlessly integrated:
1. Perceptual Hashing (dHash) & Hamming Distance similarity calculation
2. Automated visual tamper heatmap generation (/api/check-tampering)
3. Steganographic LSB digital watermarking (/api/extract-watermark)
4. Dynamic scannable QR Code embedded on generated PDF Verification Certificates
5. Smart contract batch image registration & ownership transfer functions
6. 100% automated backend transaction signing (eliminating MetaMask installation requirement)
7. Consolidated unified testing suite (backend/test_flow.py + 17 Hardhat unit tests)

====================================================================================================
[2] COMPREHENSIVE BUG FIXES AUDIT TABLE
====================================================================================================
File                           | Bug Description                  | Root Cause                             | Applied Fix
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/contracts/             | verifyImage() was non-view &     | Non-view state-modifying function      | Converted verifyImage() to 'view' function;
ImageVerification.sol          | emitted events on read; struct   | forced gas payment on checks; struct   | unified struct order to (imageHash, owner,
                               | fields were in inconsistent      | had mismatched field order vs python   | timestamp, fileName, exists); added
                               | order across files.              | wrappers and tests.                    | transferOwnership() & registerBatch().
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/deploy.py              | Script did not exist; Ganache    | Missing deployment automation; modern  | Created backend/deploy.py using solc with
                               | 2.7.1 reverted on contract       | solc defaulted to Shanghai EVM with    | '--evm-version paris', automatic deployer funding,
                               | deployment due to PUSH0 opcode.  | PUSH0 opcode unsupported by Ganache.   | ABI generation, and automated .env sync.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/config.py              | CONTRACT_ADDRESS was cached once | Config values loaded statically at     | Created dynamic ConfigMeta with lazy @property
                               | at Python process import.        | import time; redeploys required        | lookup that re-reads .env if address changes or
                               |                                  | manual process restarts.               | was previously unset.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/utils/blockchain.py    | signed_txn.rawTransaction crash; | web3.py v6+ and v7 renamed attribute   | Implemented getattr(signed, "raw_transaction",
                               | hardcoded gas price (20 gwei);   | to raw_transaction; hardcoded gas      | getattr(signed, "rawTransaction")); dynamic
                               | 1000-block history scan froze    | ignored network conditions; unbounded  | gas_price & chainId; capped scan to 100 blocks;
                               | Node.js / Ganache.               | block scan caused timeouts.            | created get_blockchain() singleton.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/utils/                 | PermissionError (WinError 32) on | PIL Image.open() keeps file handle     | Wrapped Image.open() in context manager
image_handler.py               | Windows during os.remove() or    | open on Windows until explicitly       | 'with Image.open(file_path) as img:' to release
                               | os.rename().                     | closed or garbage collected.           | file handles before filesystem manipulation.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/routes/upload.py       | Duplicate ABI loader; insecure   | Copy-pasted contract connection code;  | Replaced with get_blockchain(); added MAX_FILE_SIZE
                               | file handling; missing original  | original filenames lost during uuid    | checks; preserved original_filename in contract;
                               | filename in registerImage().     | temp renaming.                         | added perceptual dHash & steganographic watermark.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/routes/verify.py       | State-modifying contract call;   | verifyImage() invoked via send_raw_    | Migrated to view call get_image_details();
                               | unhandled exceptions left orphan | transaction; missing finally cleanup   | added secure_filename + uuid + guaranteed cleanup;
                               | temp files on disk.              | on failure.                            | added /api/check-tampering & /api/extract-watermark.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/routes/history.py      | Missing Web3 address validation; | Unchecked user address string passed   | Added Web3.is_address() validation; wrapped calls
                               | direct contract calls crashed on | directly to raw web3 contract call.    | in try-except; sanitized output records.
                               | bad address.                     |                                        |
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/app.py                 | Missing /api/health; static file | Missing healthcheck endpoint; relative | Added /api/health route; configured MAX_CONTENT_
                               | 404s; lack of file size limit    | static paths caused 404s when started  | LENGTH = 16MB; configured absolute static_folder;
                               | handling.                        | from different working directories.    | added 413 error handler and app.run() entrypoint.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
backend/requirements.txt       | Conflicting web3 pin (<6.0 vs    | Outdated requirements specified web3<6 | Updated requirements to web3>=7.0.0, Pillow>=10.0,
                               | modern pip); failed installs.    | while code used web3 v6/v7 APIs.       | pycryptodome, flask-cors, reportlab, qrcode.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
blockchain/hardhat.config.js   | paths.sources pointed to missing | Directory mismatch between Hardhat     | Corrected paths.sources to '../backend/contracts';
                               | ./contracts; default EVM broke   | and Flask backend; default EVM was     | set evmVersion to 'paris'; pointed dotenv to
                               | on Ganache (7545 vs 8545).       | Shanghai; port was 8545.               | '../backend/.env'; updated port to 7545.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
blockchain/test/               | Ethers v5 syntax failed with     | Hardhat upgraded to Ethers v6          | Migrated syntax: waitForDeployment(), getAddress(),
ImageVerification.test.js      | TypeError on deployed() & BigInt | (ethers.js v6 breaking changes).       | 1n BigInt; added 17 unit tests for registration,
                               | operations.                      |                                        | batches, ownership transfer, indexing (all pass).
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
frontend/ (upload.html,        | Required MetaMask wallet even    | web3-init.js attempted to inject       | Removed web3-init.js & MetaMask blocker; converted
verify.html, history.html,     | though backend signs all         | window.ethereum, blocking users        | frontend to 100% backend-signed architecture;
main.js, upload.js, verify.js) | transactions; UTF-8 BOM issues.  | without web3 browser extensions.       | added QR Code generation to PDF certificate;
                               |                                  | Files had corrupted UTF-8 characters.  | auto-fill hash from QR code query parameter.
-------------------------------+----------------------------------+----------------------------------------+---------------------------------------------------
Duplicate debug scripts        | 6 redundant/broken debug scripts | Cluttered repository with conflicting  | Deleted 6 redundant scripts; consolidated into
                               | in backend/ directory.           | test runners.                          | single automated test runner: backend/test_flow.py.
====================================================================================================

====================================================================================================
[3] MAJOR FEATURE IMPROVEMENTS & INNOVATIONS
====================================================================================================
1. PERCEPTUAL HASHING (dHash) & VISUAL SIMILARITY:
   - Module: backend/utils/hashing.py (calculate_dhash, calculate_perceptual_similarity)
   - Capability: Computes a 64-bit difference hash resistant to minor image compression or format
     changes. Calculates Hamming Distance and visual similarity percentage.

2. VISUAL TAMPER HEATMAP GENERATION:
   - Route: POST /api/check-tampering
   - Module: backend/utils/hashing.py (generate_tamper_diff_image)
   - Capability: Compares registered original image with uploaded suspicious image pixel-by-pixel,
     generating an amplified red-difference visual heatmap highlighting exact altered regions.

3. STEGANOGRAPHIC BLOCKCHAIN WATERMARK:
   - Route: POST /api/extract-watermark
   - Module: backend/utils/steganography.py (SteganographyHandler)
   - Capability: Embeds the Ethereum blockchain transaction hash directly into the Least Significant
     Bits (LSB) of the registered image. Invisible to human eye, extractable to prove authenticity.

4. DYNAMIC SCANNABLE QR CODE ON VERIFICATION CERTIFICATE:
   - Module: frontend/upload.html, frontend/js/upload.js (generateCertificate)
   - Capability: Generates a high-resolution QR code encoding a direct verification link:
     "http://127.0.0.1:5000/verify?hash=<IMAGE_HASH>" embedded right onto the downloaded PDF certificate.
   - When scanned with any mobile camera, automatically opens verify page and validates the hash!

5. ENHANCED SMART CONTRACT CAPABILITIES:
   - Module: backend/contracts/ImageVerification.sol
   - Capability: Added batch registration function (registerBatch) to notarize multiple image hashes
     in a single Ethereum transaction (reducing gas costs), plus secure ownership transfer
     (transferOwnership) with access control checks.

====================================================================================================
[4] VERIFICATION COMMANDS & INSTRUCTIONS
====================================================================================================
To run and verify the entire system from scratch:

Step 1: Ensure Ganache is running on port 7545
   Ganache RPC URL: http://127.0.0.1:7545
   Network ID: 5777 or 1337

Step 2: Deploy Smart Contract
   Open terminal, navigate to backend:
   cd "C:\Users\Sunil\OneDrive\Desktop\Bhanu's Major Project\Blockchain\backend"
   python deploy.py

   -> Solc compiles contracts/ImageVerification.sol with --evm-version paris
   -> Deploys contract to Ganache
   -> Auto-updates CONTRACT_ADDRESS in backend/.env

Step 3: Run the Consolidated System Verification Test
   python test_flow.py

   -> Verifies Ganache connectivity
   -> Tests on-chain image registration
   -> Tests on-chain view verification
   -> Tests Flask REST API health & verification endpoints
   -> (Result: ALL BLOCKCHAIN CORE TESTS PASSED)

Step 4: Run Hardhat Unit Tests
   cd "C:\Users\Sunil\OneDrive\Desktop\Bhanu's Major Project\Blockchain\blockchain"
   npx hardhat test

   -> 17 unit tests execute and pass (Deployment, Registration, Batches, Transfers, Verification)

Step 5: Start Flask Application
   cd "C:\Users\Sunil\OneDrive\Desktop\Bhanu's Major Project\Blockchain\backend"
   python app.py

Step 6: Open Web Application in Browser
   Navigate to: http://127.0.0.1:5000
   - Home Page:     http://127.0.0.1:5000/
   - Register Page: http://127.0.0.1:5000/upload  (Upload photo -> Register on Blockchain -> Download PDF Certificate with QR Code)
   - Verify Page:   http://127.0.0.1:5000/verify  (Upload photo or paste hash or scan QR code -> 100% cryptographic verification)
   - History Page:  http://127.0.0.1:5000/history (Search wallet address -> view all registered on-chain images)

====================================================================================================
[5] SYSTEM SPECIFICATIONS & ENVIRONMENT
====================================================================================================
Operating System:   Windows 11
Python Version:     Python 3.13
Solidity Version:   0.8.19 (EVM Version: Paris)
Web3 Version:       web3.py >= 7.0.0
Hardhat Version:    Hardhat with Ethers v6
Node.js RPC Node:   Ganache 2.7.1 (http://127.0.0.1:7545)
Active Contract:    0xa1eeA513d0263CB2E3eA45100110B88929bA53cc

====================================================================================================
END OF AUDIT LOG - ALL SYSTEMS HEALTHY AND OPERATIONAL
====================================================================================================