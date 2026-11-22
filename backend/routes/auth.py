import os
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
from utils.guest_wallets import create_guest_wallet, get_guest_wallet

auth_bp = Blueprint('auth', __name__)


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
            'guest_id': guest_id,
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
    """Generate authentication challenge nonce for MetaMask personal_sign"""
    try:
        data = request.get_json(silent=True) or {}
        wallet_address = data.get('walletAddress', '').strip()
        if not wallet_address:
            return jsonify({'success': False, 'error': 'walletAddress is required'}), 400

        nonce = generate_nonce(wallet_address)
        message = get_expected_message(wallet_address, nonce)

        return jsonify({
            'success': True,
            'nonce': nonce,
            'message': message,
            'expiresIn': 300
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@auth_bp.route('/api/auth/wallet-login', methods=['POST'])
def wallet_login_endpoint():
    """Direct wallet login endpoint returning JWT session token for an Ethereum address"""
    try:
        data = request.get_json(silent=True) or {}
        wallet_address = (data.get('wallet_address') or data.get('walletAddress') or '').strip()

        if not wallet_address or not wallet_address.startswith('0x') or len(wallet_address) != 42:
            return jsonify({'success': False, 'error': 'Valid 42-character Ethereum address (0x...) is required'}), 400

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
        'guestId': getattr(g, 'guest_id', None)
    }), 200
