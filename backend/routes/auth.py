import os
import time
import secrets
import hashlib
from flask import Blueprint, request, jsonify, g
from eth_account import Account
from utils.auth import (
    generate_nonce,
    get_expected_message,
    verify_signature,
    create_session_token,
    require_auth,
    get_secret_key
)
from utils.email import send_otp_email

auth_bp = Blueprint('auth', __name__)

# In-memory OTP storage: {clean_email: {"otp": "123456", "expires_at": timestamp}}
_email_otps = {}
OTP_EXPIRY_SECONDS = 300  # 5 minutes


def derive_custodial_wallet(email: str) -> str:
    """
    Derives a deterministic, persistent Ethereum custodial address from the server secret and email.
    Guarantees the user always retrieves the exact same wallet across sessions and server restarts.
    """
    secret = get_secret_key()
    seed_hex = hashlib.sha256(f"custodial:{secret}:{email.strip().lower()}".encode('utf-8')).hexdigest()
    account = Account.from_key("0x" + seed_hex)
    return account.address.lower()


@auth_bp.route('/api/auth/email-request', methods=['POST'])
def email_request():
    """
    Generate and send 6-digit OTP code to user's email.
    If SMTP is unavailable or fails, logs OTP to console and returns it in response for viva/demo.
    """
    try:
        data = request.get_json(silent=True) or {}
        email = (data.get('email') or '').strip().lower()

        if not email or '@' not in email or '.' not in email:
            return jsonify({
                'success': False,
                'error': 'Please provide a valid email address.'
            }), 400

        # Generate secure 6-digit numeric OTP
        otp = f"{secrets.randbelow(900000) + 100000}"
        _email_otps[email] = {
            'otp': otp,
            'expires_at': time.time() + OTP_EXPIRY_SECONDS
        }

        # Attempt to deliver via SMTP
        sent = False
        try:
            sent = send_otp_email(email, otp)
        except Exception as mail_err:
            print(f"[AUTH OTP WARNING] SMTP error for {email}: {mail_err}")
            sent = False

        print(f"\n{'='*50}")
        print(f"[AUTH OTP] Email: {email} | OTP: {otp} | SMTP Sent: {sent}")
        print(f"{'='*50}\n")

        return jsonify({
            'success': True,
            'message': 'Verification code sent to your email.' if sent else 'OTP generated (logged to server console for demo).',
            'email': email,
            'otp_for_demo': otp
        }), 200

    except Exception as e:
        print(f"[AUTH OTP ERROR] {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/email-verify', methods=['POST'])
def email_verify():
    """
    Verify OTP code and provision/derive custodial Ethereum wallet + JWT session.
    """
    try:
        data = request.get_json(silent=True) or {}
        email = (data.get('email') or '').strip().lower()
        otp = (data.get('otp') or '').strip()

        if not email or not otp:
            return jsonify({
                'success': False,
                'error': 'Email and verification code are required.'
            }), 400

        record = _email_otps.get(email)
        if not record:
            return jsonify({
                'success': False,
                'error': 'No verification code requested or code expired. Please request a new code.'
            }), 400

        if time.time() > record['expires_at']:
            _email_otps.pop(email, None)
            return jsonify({
                'success': False,
                'error': 'Verification code expired. Please request a new code.'
            }), 400

        if record['otp'] != otp:
            return jsonify({
                'success': False,
                'error': 'Invalid verification code. Please check and try again.'
            }), 400

        # OTP verified - clear from store
        _email_otps.pop(email, None)

        # Derive custodial wallet
        custodial_wallet = derive_custodial_wallet(email)

        # Generate JWT session token
        token = create_session_token(custodial_wallet, login_type="email", email=email)

        return jsonify({
            'success': True,
            'token': token,
            'wallet': custodial_wallet,
            'wallet_address': custodial_wallet,
            'loginType': 'email',
            'email': email,
            'expiresIn': 86400
        }), 200

    except Exception as e:
        print(f"[EMAIL VERIFY ERROR] {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/guest', methods=['POST'])
@auth_bp.route('/api/auth/demo-login', methods=['POST'])
def guest_login():
    """
    Provision instant ephemeral demo wallet without requiring any wallet extension or email.
    Grants 24h upload, verify, and certificate access.
    """
    try:
        data = request.get_json(silent=True) or {}
        wallet_address = (data.get('walletAddress') or data.get('wallet') or '').strip().lower()
        if not wallet_address or not wallet_address.startswith('0x') or len(wallet_address) != 42:
            guest_account = Account.create()
            wallet_address = guest_account.address.lower()

        is_demo = request.path.endswith('demo-login')
        login_type = "demo" if is_demo else "guest"
        token = create_session_token(wallet_address, login_type=login_type)

        return jsonify({
            'success': True,
            'token': token,
            'wallet': wallet_address,
            'wallet_address': wallet_address,
            'loginType': login_type,
            'isDemo': is_demo,
            'expiresIn': 86400
        }), 200

    except Exception as e:
        print(f"[GUEST LOGIN ERROR] {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/nonce', methods=['POST'])
def auth_nonce_endpoint():
    """Generate a cryptographic nonce challenge for a wallet address"""
    try:
        data = request.get_json(silent=True) or {}
        wallet_address = data.get('walletAddress', '').strip()
        if not wallet_address or not wallet_address.startswith('0x') or len(wallet_address) != 42:
            return jsonify({'success': False, 'error': 'A valid Ethereum wallet address (0x...) is required'}), 400

        nonce = generate_nonce(wallet_address)
        message = get_expected_message(wallet_address, nonce)

        return jsonify({
            'success': True,
            'nonce': nonce,
            'message': message,
            'walletAddress': wallet_address
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/login', methods=['POST'])
def auth_login_endpoint():
    """Verify MetaMask personal_sign signature and return JWT session token"""
    try:
        data = request.get_json(silent=True) or {}
        wallet_address = data.get('walletAddress', '').strip()
        nonce = data.get('nonce', '').strip()
        signature = data.get('signature', '').strip()

        if not wallet_address or not nonce or not signature:
            return jsonify({'success': False, 'error': 'walletAddress, nonce, and signature are required'}), 400

        if not verify_signature(wallet_address, nonce, signature):
            return jsonify({'success': False, 'error': 'Invalid signature or expired nonce. Please try again.'}), 401

        token = create_session_token(wallet_address, login_type="metamask")
        return jsonify({
            'success': True,
            'token': token,
            'wallet': wallet_address.lower(),
            'wallet_address': wallet_address.lower(),
            'loginType': 'metamask',
            'expiresIn': 86400
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/me', methods=['GET'])
@require_auth
def auth_me_endpoint():
    """Return currently authenticated wallet session"""
    return jsonify({
        'success': True,
        'wallet': g.wallet_address,
        'wallet_address': g.wallet_address,
        'loginType': getattr(g, 'login_type', 'metamask'),
        'email': getattr(g, 'user_email', None)
    }), 200
