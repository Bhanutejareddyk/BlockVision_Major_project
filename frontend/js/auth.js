// Auth module for BlockVision-2.0
// Handles MetaMask wallet connection, cryptographic challenge signing, and JWT session persistence.

const Auth = {
    TOKEN_KEY: 'blockvision_token',
    WALLET_KEY: 'blockvision_wallet',
    EXPIRES_KEY: 'blockvision_auth_expires',

    // Check if MetaMask or compatible web3 wallet is installed
    isMetaMaskInstalled() {
        return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
    },

    // Check if user has an active, unexpired session
    isLoggedIn() {
        const token = this.getToken();
        const wallet = this.getWallet();
        const expiresAt = parseInt(localStorage.getItem(this.EXPIRES_KEY) || '0', 10);
        if (!token || !wallet) return false;
        if (expiresAt && Date.now() > expiresAt) {
            this.logout(false);
            return false;
        }
        return true;
    },

    // Get current session token
    getToken() {
        return localStorage.getItem(this.TOKEN_KEY) || '';
    },

    // Get current wallet address
    getWallet() {
        return localStorage.getItem(this.WALLET_KEY) || '';
    },

    // Authorization headers for fetch requests
    authHeaders() {
        const token = this.getToken();
        if (token) {
            return { 'Authorization': `Bearer ${token}` };
        }
        return {};
    },

    // Request account access from MetaMask
    async connectWallet() {
        if (!this.isMetaMaskInstalled()) {
            throw new Error('MetaMask is not installed. Please install MetaMask to use this feature.');
        }

        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        if (!accounts || accounts.length === 0) {
            throw new Error('No Ethereum account selected.');
        }

        return accounts[0].toLowerCase();
    },

    // Complete login flow: get nonce, prompt personal_sign in MetaMask, exchange for JWT
    async loginWithWallet() {
        try {
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Connecting', 'Connecting to your MetaMask wallet...', 'info');
            }

            const walletAddress = await this.connectWallet();
            const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';

            // 1. Request nonce challenge from backend
            const nonceRes = await fetch(`${apiBase}/api/auth/nonce`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress })
            });

            const nonceData = await nonceRes.json();
            if (!nonceRes.ok || !nonceData.success) {
                throw new Error(nonceData.error || 'Failed to retrieve login challenge.');
            }

            const { nonce, message } = nonceData;

            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Signing', 'Please sign the authentication message in MetaMask...', 'info');
            }

            // 2. Request user signature in MetaMask (personal_sign)
            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, walletAddress]
            });

            // 3. Send signature to backend to verify and receive JWT
            const loginRes = await fetch(`${apiBase}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress,
                    nonce,
                    signature
                })
            });

            const loginData = await loginRes.json();
            if (!loginRes.ok || !loginData.success) {
                throw new Error(loginData.error || 'Signature verification failed.');
            }

            // 4. Save session
            localStorage.setItem(this.TOKEN_KEY, loginData.token);
            localStorage.setItem(this.WALLET_KEY, loginData.wallet.toLowerCase());
            const expiresInMs = (loginData.expiresIn || 86400) * 1000;
            localStorage.setItem(this.EXPIRES_KEY, String(Date.now() + expiresInMs));

            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Signed In', `Logged in as ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`, 'success');
            }

            this.renderUI();
            window.dispatchEvent(new CustomEvent('auth:login', { detail: { wallet: loginData.wallet } }));
            return loginData.wallet;

        } catch (error) {
            console.error('Wallet login failed:', error);
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Login Failed', error.message || 'Could not log in with wallet', 'error');
            }
            throw error;
        }
    },

    // Log out user
    logout(reload = true) {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.WALLET_KEY);
        localStorage.removeItem(this.EXPIRES_KEY);
        this.renderUI();
        window.dispatchEvent(new CustomEvent('auth:logout'));
        if (reload) {
            window.location.reload();
        }
    },

    // Format address for display
    formatAddress(addr) {
        if (!addr) return '';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    },

    // Render wallet status / connect button in navbar
    renderUI() {
        const navAuth = document.getElementById('navAuth');
        if (!navAuth) return;

        if (this.isLoggedIn()) {
            const wallet = this.getWallet();
            const shortAddr = this.formatAddress(wallet);
            const etherscanUrl = `https://sepolia.etherscan.io/address/${wallet}`;
            navAuth.innerHTML = `
                <div class="wallet-badge" title="${wallet}">
                    <span class="wallet-indicator" aria-hidden="true"></span>
                    <a href="${etherscanUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">
                        ${shortAddr}
                    </a>
                    <button class="wallet-logout-btn" id="walletLogoutBtn" title="Disconnect wallet" type="button">Disconnect</button>
                </div>
            `;
            const logoutBtn = document.getElementById('walletLogoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    Auth.logout(true);
                });
            }
        } else {
            navAuth.innerHTML = `
                <button class="wallet-btn" id="connectWalletBtn" type="button">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
                        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
                    </svg>
                    <span>Connect Wallet</span>
                </button>
            `;
            const connectBtn = document.getElementById('connectWalletBtn');
            if (connectBtn) {
                connectBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    try {
                        await Auth.loginWithWallet();
                    } catch (err) {
                        // Handled in loginWithWallet
                    }
                });
            }
        }
    }
};

// Listen for MetaMask account changes
if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        const currentWallet = Auth.getWallet();
        if (accounts.length === 0) {
            Auth.logout(true);
        } else if (currentWallet && accounts[0].toLowerCase() !== currentWallet.toLowerCase()) {
            Auth.logout(true);
        }
    });
}

// Auto-render on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.renderUI();
});
