import os
import re
import time
import secrets
from flask import Blueprint, request, jsonify, g
from eth_account import Account
from utils.auth import (
    generate_nonce,
    get_expected_message,
    verify_signature,
    create_session_token,
    require_auth
)
from utils.email import send_otp_email
from utils.email_wallets import get_or_create_wallet_for_email, get_email_wallet
from utils.guest_wallets import create_guest_wallet, get_guest_wallet

auth_bp = Blueprint('auth', __name__)

# In-memory OTP storage: {clean_email: {"otp": "123456", "expires_at": timestamp, "attempts": 0}}
_email_otps = {}
OTP_EXPIRY_SECONDS = 300  # 5 minutes
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$')


@auth_bp.route('/api/auth/email-request', methods=['POST'])
def email_request():
    """
    Generate and send 6-digit OTP code to user's real email via Gmail SMTP.
    Returns 500 with exact error if SMTP configuration or transmission fails.
    """
    try:
        data = request.get_json(silent=True) or {}
        email = (data.get('email') or '').strip().lower()

        if not email or not EMAIL_REGEX.match(email):
            return jsonify({
                'success': False,
                'error': 'Please provide a valid email address.'
            }), 400

        # Generate secure 6-digit numeric OTP
        otp = f"{secrets.randbelow(900000) + 100000}"
        _email_otps[email] = {
            'otp': otp,
            'expires_at': time.time() + OTP_EXPIRY_SECONDS,
            'attempts': 0
        }

        # Send via real SMTP (Gmail)
        smtp_res = send_otp_email(email, otp)
        if not smtp_res.get('success'):
            err = smtp_res.get('error', 'SMTP dispatch failed')
            print(f"[AUTH OTP FAILURE] Could not send OTP to {email}: {err}")
            return jsonify({
                'success': False,
                'error': err
            }), 500

        print(f"[AUTH OTP SUCCESS] Real-time OTP sent to {email}")
        return jsonify({
            'success': True,
            'message': f'OTP sent to {email}. Please check your Inbox and Spam folder.',
            'email': email
        }), 200

    except Exception as e:
        print(f"[AUTH OTP ERROR] {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/email-verify', methods=['POST'])
def email_verify():
    """
    Verify OTP code, retrieve or generate persistent custodial Ethereum wallet, and issue JWT.
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

        record['attempts'] = record.get('attempts', 0) + 1
        if record['attempts'] > 3:
            _email_otps.pop(email, None)
            return jsonify({
                'success': False,
                'error': 'Too many failed attempts. Please request a new verification code.'
            }), 400

        if record['otp'] != otp:
            remaining = max(0, 3 - record['attempts'])
            return jsonify({
                'success': False,
                'error': f'Invalid verification code. {remaining} attempt(s) remaining.'
            }), 400

        # OTP verified - clear from store
        _email_otps.pop(email, None)

        # Permanent custodial wallet per email (stable across logins and restarts)
        custodial_wallet = get_or_create_wallet_for_email(email)

        # Generate JWT session token with both wallet and email
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
def guest_create():
    """
    Create a new reusable Guest ID (e.g. GUEST-A7K9P2) with a persistent custodial wallet.
    User can save this Guest ID and log in again later with their uploads preserved.
    """
    try:
        guest_id, wallet_addr = create_guest_wallet()
        token = create_session_token(wallet_addr, login_type="guest", guest_id=guest_id)

        return jsonify({
            'success': True,
            'guestId': guest_id,
            'wallet': wallet_addr,
            'wallet_address': wallet_addr,
            'loginType': 'guest',
            'token': token,
            'message': 'Save this Guest ID to login again',
            'expiresIn': 86400
        }), 200

    except Exception as e:
        print(f"[GUEST CREATE ERROR] {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/guest-login', methods=['POST'])
def guest_login():
    """
    Log in using an existing Guest ID. Restores the user's permanent custodial wallet and upload history.
    """
    try:
        data = request.get_json(silent=True) or {}
        guest_id = (data.get('guestId') or data.get('guest_id') or '').strip().upper()

        if not guest_id:
            return jsonify({
                'success': False,
                'error': 'Guest ID is required.'
            }), 400

        wallet_addr = get_guest_wallet(guest_id)
        if not wallet_addr:
            return jsonify({
                'success': False,
                'error': 'Guest ID not found. Check spelling or create a new Guest ID.'
            }), 404

        token = create_session_token(wallet_addr, login_type="guest", guest_id=guest_id)

        return jsonify({
            'success': True,
            'guestId': guest_id,
            'wallet': wallet_addr,
            'wallet_address': wallet_addr,
            'loginType': 'guest',
            'token': token,
            'expiresIn': 86400
        }), 200

    except Exception as e:
        print(f"[GUEST LOGIN ERROR] {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/demo-login', methods=['POST'])
def demo_login():
    """Fallback demo login compatible with legacy endpoint"""
    return guest_create()


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
        'email': getattr(g, 'user_email', None),
        'guestId': getattr(g, 'guest_id', None)
    }), 200
