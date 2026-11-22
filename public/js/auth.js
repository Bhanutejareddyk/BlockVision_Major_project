// Auth module for BlockVision-2.0
// Supports MetaMask / Web3 & Reusable Guest ID Authentication

const Auth = {
    TOKEN_KEY: 'blockvision_token',
    WALLET_KEY: 'blockvision_wallet',
    LOGIN_TYPE_KEY: 'blockvision_login_type',
    GUEST_ID_KEY: 'blockvision_guest_id',
    EXPIRES_KEY: 'blockvision_auth_expires',

    // Detect mobile device
    isMobile() {
        return typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    // Check if MetaMask or compatible web3 wallet is installed in browser
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

    getToken() {
        return localStorage.getItem(this.TOKEN_KEY) || '';
    },

    getWallet() {
        return localStorage.getItem(this.WALLET_KEY) || '';
    },

    getLoginType() {
        return localStorage.getItem(this.LOGIN_TYPE_KEY) || 'metamask';
    },

    getGuestId() {
        return localStorage.getItem(this.GUEST_ID_KEY) || '';
    },

    authHeaders() {
        const token = this.getToken();
        if (token) {
            return { 'Authorization': `Bearer ${token}` };
        }
        return {};
    },

    formatAddress(addr) {
        if (!addr) return '';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    },

    checkAuth(openModalIfLoggedOut = false) {
        const loggedIn = this.isLoggedIn();
        if (!loggedIn && openModalIfLoggedOut) {
            this.openLoginModal();
        }
        return loggedIn;
    },

    // =========================================================================
    // OPTION 1: MetaMask & Mobile Web3
    // =========================================================================

    async connectWallet() {
        if (!this.isMetaMaskInstalled()) {
            throw new Error('MetaMask is not installed.');
        }

        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        if (!accounts || accounts.length === 0) {
            throw new Error('No Ethereum account selected.');
        }

        return accounts[0].toLowerCase();
    },

    openMetaMaskMobile() {
        const currentPath = window.location.host + window.location.pathname + window.location.search;
        const deepLink = `https://metamask.app.link/dapp/${currentPath}`;
        window.location.href = deepLink;
    },

    async loginWithWallet() {
        console.log("loginWithWallet initiated");
        const btn = document.getElementById('btnConnectMetaMask') || document.getElementById('btnModalConnectWallet');
        const origText = btn ? btn.textContent : 'Connect with MetaMask';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Connecting...';
        }

        try {
            if (!this.isMetaMaskInstalled()) {
                if (this.isMobile()) {
                    this.openMetaMaskMobile();
                    return;
                }
                throw new Error('MetaMask is not installed. Please install MetaMask extension or use Guest ID.');
            }

            const wallet = await this.connectWallet();
            const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';

            // Try fast /api/auth/wallet-login
            try {
                const wRes = await fetch(`${apiBase}/api/auth/wallet-login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wallet_address: wallet })
                });
                const wData = await wRes.json();
                if (wRes.ok && wData.token) {
                    this.saveSession(wData.token, wallet, 'metamask', null, wData.expiresIn);
                    return wallet;
                }
            } catch (errFast) {
                console.log("wallet-login fallback note:", errFast);
            }

            // Fallback: Challenge Nonce & Signature
            const nonceRes = await fetch(`${apiBase}/api/auth/nonce`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress: wallet })
            });
            const nonceData = await nonceRes.json();
            if (!nonceRes.ok || !nonceData.nonce) {
                throw new Error(nonceData.error || 'Failed to generate authentication challenge.');
            }

            let signature;
            try {
                signature = await window.ethereum.request({
                    method: 'personal_sign',
                    params: [nonceData.message, wallet]
                });
            } catch (signErr) {
                if (signErr.code === 4001) {
                    throw new Error('Signature request was rejected in MetaMask.');
                }
                throw signErr;
            }

            const loginRes = await fetch(`${apiBase}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: wallet,
                    nonce: nonceData.nonce,
                    signature: signature
                })
            });

            const loginData = await loginRes.json();
            if (!loginRes.ok || !loginData.token) {
                throw new Error(loginData.error || 'Signature verification failed.');
            }

            this.saveSession(loginData.token, wallet, 'metamask', null, loginData.expiresIn);
            return wallet;

        } catch (err) {
            console.error('Wallet login error:', err);
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Authentication Error', err.message, 'error');
            } else {
                alert(err.message);
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = origText;
            }
        }
    },

    saveSession(token, wallet, loginType, guestId = null, expiresIn = 86400) {
        localStorage.setItem(this.TOKEN_KEY, token);
        localStorage.setItem(this.WALLET_KEY, wallet.toLowerCase());
        localStorage.setItem(this.LOGIN_TYPE_KEY, loginType);
        if (guestId) {
            localStorage.setItem(this.GUEST_ID_KEY, guestId);
        } else {
            localStorage.removeItem(this.GUEST_ID_KEY);
        }
        const expiresInMs = (expiresIn || 86400) * 1000;
        localStorage.setItem(this.EXPIRES_KEY, String(Date.now() + expiresInMs));

        if (typeof Utils !== 'undefined' && Utils.showToast) {
            Utils.showToast('Signed In', `Active as ${this.formatAddress(wallet)}`, 'success');
        }

        this.closeLoginModal();
        this.renderUI();
        window.dispatchEvent(new CustomEvent('auth:login', { detail: { wallet, loginType, guestId } }));
    },

    async loginWithWalletConnect() {
        try {
            if (typeof WalletConnectProvider === 'undefined' && typeof window.WalletConnectProvider === 'undefined') {
                Utils.showToast('WalletConnect', 'WalletConnect loading... If unavailable, please use Guest ID or MetaMask.', 'info');
                return;
            }
            const ProviderClass = window.WalletConnectProvider?.default || window.WalletConnectProvider;
            const provider = new ProviderClass({
                rpc: { 11155111: 'https://rpc.sepolia.org' },
                chainId: 11155111,
                qrcode: true
            });

            await provider.enable();
            const accounts = provider.accounts;
            if (!accounts || accounts.length === 0) {
                throw new Error('No account returned by WalletConnect.');
            }

            const wallet = accounts[0].toLowerCase();
            const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';

            const res = await fetch(`${apiBase}/api/auth/wallet-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: wallet })
            });
            const data = await res.json();
            if (!res.ok || !data.token) {
                throw new Error(data.error || 'WalletConnect verification failed');
            }

            this.saveSession(data.token, wallet, 'metamask', null, data.expiresIn);
            return wallet;

        } catch (err) {
            console.error('WalletConnect error:', err);
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('WalletConnect', err.message || 'Connection cancelled', 'warning');
            }
        }
    },

    // =========================================================================
    // OPTION 2: GUEST ID (Reusable Guest Mode with Persistent History)
    // =========================================================================

    async createGuestAccount() {
        const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
        const res = await fetch(`${apiBase}/api/auth/guest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Could not generate Guest ID.');
        }

        this.saveSession(data.token, data.wallet, 'guest', data.guestId, data.expiresIn);
        return data;
    },

    loginAsGuest() {
        return this.createGuestAccount();
    },

    async loginWithGuestId(guestId) {
        const cleanId = (guestId || '').trim().toUpperCase();
        if (!cleanId) {
            throw new Error('Please enter your Guest ID (e.g. GUEST-A7K9P2).');
        }

        const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
        const res = await fetch(`${apiBase}/api/auth/guest-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guestId: cleanId })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Guest ID not found. Check spelling or create a new Guest ID.');
        }

        this.saveSession(data.token, data.wallet, 'guest', data.guestId, data.expiresIn);
        return data;
    },

    logout(reload = true) {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.WALLET_KEY);
        localStorage.removeItem(this.LOGIN_TYPE_KEY);
        localStorage.removeItem(this.EXPIRES_KEY);
        this.renderUI();
        window.dispatchEvent(new CustomEvent('auth:logout'));
        if (reload) {
            window.location.reload();
        }
    },

    // =========================================================================
    // MODAL CONTROLLER & DOM INJECTION
    // =========================================================================

    openLoginModal(defaultTab = 'metamask') {
        let modal = document.getElementById('loginModal') || document.getElementById('authModal');
        if (!modal) {
            this.injectModalDOM();
            modal = document.getElementById('loginModal') || document.getElementById('authModal');
        }
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
            modal.style.visibility = 'visible';
            modal.style.opacity = '1';
            modal.style.pointerEvents = 'auto';
            document.body.style.overflow = 'hidden';
            this.switchModalTab(defaultTab);
        }
    },

    closeLoginModal() {
        const modal = document.getElementById('loginModal') || document.getElementById('authModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
            modal.style.visibility = 'hidden';
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            document.body.style.overflow = '';
        }
    },

    switchModalTab(tabName) {
        const modal = document.getElementById('loginModal') || document.getElementById('authModal');
        if (!modal) return;

        const tabs = modal.querySelectorAll('.bv-tab');
        const panes = modal.querySelectorAll('.bv-tab-pane');

        tabs.forEach(t => {
            if (t.dataset.tab === tabName) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        });

        panes.forEach(p => {
            if (p.id === `tabPane-${tabName}`) {
                p.classList.add('active');
                p.style.display = 'block';
            } else {
                p.classList.remove('active');
                p.style.display = 'none';
            }
        });
    },

    injectModalDOM() {
        if (document.getElementById('loginModal') || document.getElementById('authModal')) return;

        const hasExtension = this.isMetaMaskInstalled();
        const isMob = this.isMobile();
        const savedGid = localStorage.getItem(this.GUEST_ID_KEY) || '';

        const modalHtml = `
        <div class="bv-modal modal" id="loginModal" style="display: none;">
            <div class="bv-modal-backdrop" id="authModalBackdrop" onclick="closeLoginModal()"></div>
            <div class="bv-modal-dialog">
                <div class="bv-modal-header">
                    <div>
                        <h3 class="bv-modal-title">Sign In to BlockVision</h3>
                        <p class="bv-modal-subtitle">Choose your preferred sign-in method</p>
                    </div>
                    <button type="button" class="bv-modal-close" id="authModalClose" onclick="closeLoginModal()" aria-label="Close modal">&times;</button>
                </div>

                <!-- 2 Options Tabs: MetaMask & Guest ID -->
                <div class="bv-tabs">
                    <button type="button" class="bv-tab active" data-tab="metamask">MetaMask</button>
                    <button type="button" class="bv-tab" data-tab="guest">Guest ID</button>
                </div>

                <!-- TAB 1: MetaMask / Web3 -->
                <div class="bv-tab-pane active" id="tabPane-metamask">
                    ${hasExtension ? `
                        <div class="bv-card-info">Connect your Web3 browser extension (MetaMask / Brave / Coinbase) on Sepolia Testnet.</div>
                        <button type="button" class="bv-btn bv-btn-metamask" id="btnConnectMetaMask" onclick="connectWalletWithMetaMask()">Connect with MetaMask</button>
                    ` : `
                        <div class="bv-card-info" style="border-left: 3px solid #f59e0b;">
                            <strong>No Web3 extension detected in this browser.</strong><br>
                            ${isMob ? 'Tap below to open directly in the MetaMask mobile app, or continue as Guest.' : 'Install MetaMask for desktop Chrome, or use <strong>Guest ID</strong> with zero installation.'}
                        </div>
                        ${isMob ? `<button type="button" class="bv-btn bv-btn-metamask" id="btnOpenMetaMaskApp" onclick="Auth.openMetaMaskMobile()" style="margin-bottom: 10px;">Open in MetaMask App</button>` : ''}
                        <button type="button" class="bv-btn bv-btn-secondary" id="btnConnectWalletConnect" onclick="Auth.loginWithWalletConnect()" style="margin-bottom: 10px;">Connect with WalletConnect</button>
                        <div style="text-align: center; margin-top: 12px; font-size: 12px;">
                            <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" style="color: #0071e3; text-decoration: underline;">Download MetaMask Browser Extension &rarr;</a>
                        </div>
                    `}
                </div>

                <!-- TAB 2: Guest ID (Reusable Login + History Persistence) -->
                <div class="bv-tab-pane" id="tabPane-guest" style="display: none;">
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <!-- Section A: Login with existing Guest ID -->
                        <div class="bv-card-info" style="border-left: 3px solid #0071e3; margin-bottom: 0;">
                            <strong style="color: #0f172a;">Already have a Guest ID?</strong>
                            <p style="margin: 4px 0 10px 0; font-size: 12px; color: #64748b;">Enter your previously saved Guest ID to resume your session and restore your upload history.</p>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="authGuestIdInput" class="bv-input" placeholder="GUEST-XXXXXX" value="${savedGid || ''}" maxlength="12" style="text-transform: uppercase; letter-spacing: 2px; font-weight: 700; font-family: monospace; font-size: 14px;">
                                <button type="button" class="bv-btn bv-btn-primary" id="btnGuestLoginExisting" onclick="loginWithExistingGuestId()" style="width: auto; padding: 0 16px; white-space: nowrap;">Log In</button>
                            </div>
                        </div>

                        <div style="display: flex; align-items: center; text-align: center; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin: 2px 0;">
                            <span style="flex: 1; border-bottom: 1px solid #e2e8f0;"></span>
                            <span style="padding: 0 10px;">or</span>
                            <span style="flex: 1; border-bottom: 1px solid #e2e8f0;"></span>
                        </div>

                        <!-- Section B: Create New Guest ID -->
                        <div id="guestCreateSection">
                            <div class="bv-card-info" style="border-left: 3px solid #10b981; margin-bottom: 10px;">
                                <strong>Create New Guest ID</strong>
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Generates a reusable Guest ID with a persistent custodial wallet. No wallet extension required.</p>
                            </div>
                            <button type="button" class="bv-btn bv-btn-guest" id="btnCreateGuest" onclick="loginAsGuest()">
                                <span>Create New Guest ID</span>
                            </button>
                        </div>

                        <!-- Generated ID Card -->
                        <div id="guestCreatedCard" style="display: none; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; text-align: center;">
                            <div style="font-size: 11px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 1px;">Your Guest ID — Save It!</div>
                            <div id="newGuestIdDisplay" style="font-size: 22px; font-weight: 800; font-family: monospace; letter-spacing: 3px; color: #047857; margin: 8px 0; user-select: all;"></div>
                            <p style="font-size: 12px; color: #047857; margin-bottom: 12px;">Save this ID to log back in anytime and view all your photos.</p>
                            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                                <button type="button" class="bv-btn bv-btn-secondary" onclick="copyGuestId()" style="font-size: 12px; padding: 6px 12px; min-height: 34px; width: auto;">Copy ID</button>
                                <button type="button" class="bv-btn bv-btn-secondary" onclick="downloadGuestTxt()" style="font-size: 12px; padding: 6px 12px; min-height: 34px; width: auto;">Download .txt</button>
                                <button type="button" class="bv-btn bv-btn-guest" onclick="closeLoginModal()" style="font-size: 12px; padding: 6px 14px; min-height: 34px; width: auto;">Enter Dashboard &rarr;</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);
        this.bindModalEvents();
    },

    bindModalEvents() {
        const modal = document.getElementById('loginModal') || document.getElementById('authModal');
        if (!modal) return;

        const tabs = modal.querySelectorAll('.bv-tab');
        tabs.forEach(tab => {
            tab.onclick = () => this.switchModalTab(tab.dataset.tab);
        });
    },

    // =========================================================================
    // NAVBAR UI RENDERING
    // =========================================================================

    renderUI() {
        const navAuth = document.getElementById('navAuth');
        if (!navAuth) return;

        if (this.isLoggedIn()) {
            const wallet = this.getWallet();
            const shortAddr = this.formatAddress(wallet);
            const loginType = this.getLoginType();
            const guestId = this.getGuestId();
            const etherscanUrl = `https://sepolia.etherscan.io/address/${wallet}`;

            let labelHtml = '';
            let indicatorColor = '#34c759'; // Green for metamask

            if (loginType === 'guest') {
                indicatorColor = '#f59e0b'; // Amber
                const displayId = guestId || 'Guest';
                labelHtml = `
                    <span title="Guest ID: ${displayId} (${wallet})">${displayId} (${shortAddr})</span>
                    <button type="button" class="wallet-logout-btn" id="guestCopyHeaderBtn" onclick="copyGuestId()" title="Copy Guest ID" style="color: #f59e0b; margin-left: 2px;">Copy</button>
                `;
            } else {
                labelHtml = `<a href="${etherscanUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;" title="${wallet}">${shortAddr}</a>`;
            }

            navAuth.innerHTML = `
                <div class="wallet-badge" title="${wallet}">
                    <span class="wallet-indicator" style="background: ${indicatorColor}; box-shadow: 0 0 6px ${indicatorColor};" aria-hidden="true"></span>
                    ${labelHtml}
                    <button class="wallet-logout-btn" id="walletLogoutBtn" onclick="logout()" title="Log out" type="button">Log Out</button>
                </div>
            `;
        } else {
            navAuth.innerHTML = `
                <button class="wallet-btn" id="connectWalletBtn" type="button" onclick="connectWallet()">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
                        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
                    </svg>
                    <span>Sign In / Connect</span>
                </button>
            `;
            const connectBtn = document.getElementById('connectWalletBtn');
            if (connectBtn) {
                connectBtn.onclick = function(e) {
                    if (e) e.preventDefault();
                    window.connectWallet();
                };
            }
        }
        console.log("Connect button found:", document.getElementById('connectWalletBtn'));
        console.log("connectWallet function:", typeof window.connectWallet);
    },

    updateUI() {
        return this.renderUI();
    }
};

// =========================================================================
// GLOBAL FUNCTIONS (Directly accessible via inline onclick & script calls)
// =========================================================================

window.connectWallet = async function() {
    console.log("connectWallet clicked");
    console.log("ethereum:", typeof window.ethereum);
    if (typeof Auth !== 'undefined') {
        Auth.openLoginModal('metamask');
    }
};

window.connectWalletWithMetaMask = async function() {
    console.log("connectWalletWithMetaMask called");
    if (typeof Auth !== 'undefined') {
        return Auth.loginWithWallet();
    }
};

window.connectWithWalletConnect = function() {
    if (typeof Auth !== 'undefined') {
        return Auth.loginWithWalletConnect();
    }
};

window.loginAsGuest = function() {
    console.log("loginAsGuest called");
    if (typeof Auth !== 'undefined') {
        return Auth.createGuestAccount();
    }
};

window.loginWithExistingGuestId = function() {
    const input = document.getElementById('authGuestIdInput');
    const gid = input ? input.value.trim().toUpperCase() : '';
    if (!gid) {
        alert("Please enter your Guest ID (e.g. GUEST-A7K9P2).");
        return;
    }
    if (typeof Auth !== 'undefined') {
        return Auth.loginWithGuestId(gid);
    }
};

window.loginWithGuestId = function(id) {
    if (typeof Auth !== 'undefined') {
        return Auth.loginWithGuestId(id);
    }
};

window.closeLoginModal = function() {
    if (typeof Auth !== 'undefined') {
        Auth.closeLoginModal();
    }
};

window.copyGuestId = function() {
    const disp = document.getElementById('newGuestIdDisplay');
    const gid = (disp && disp.textContent.trim()) ? disp.textContent.trim() : (localStorage.getItem('blockvision_guest_id') || '');
    if (gid) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(gid);
        }
        if (typeof Utils !== 'undefined' && Utils.showToast) {
            Utils.showToast('Copied!', `Guest ID ${gid} copied to clipboard`, 'success');
        } else {
            alert(`Copied ${gid}`);
        }
    }
};

window.downloadGuestTxt = function() {
    const disp = document.getElementById('newGuestIdDisplay');
    const gid = (disp && disp.textContent.trim()) ? disp.textContent.trim() : (localStorage.getItem('blockvision_guest_id') || '');
    const wallet = localStorage.getItem('blockvision_wallet') || '';
    const text = `BlockVision Digital Asset Provenance\nYour Guest ID: ${gid}\nCustodial Wallet: ${wallet}\nNetwork: Ethereum Sepolia Testnet\nWebsite: https://blockvision-nu.vercel.app\n\nKeep this Guest ID safe to restore your photos and view history anytime.\n`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blockvision-${gid || 'guest'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

window.logout = function(reload = true) {
    if (typeof Auth !== 'undefined') {
        return Auth.logout(reload);
    }
};

window.checkAuth = function(openModal = false) {
    if (typeof Auth !== 'undefined') {
        return Auth.checkAuth(openModal);
    }
    return false;
};

window.updateUI = function() {
    if (typeof Auth !== 'undefined') {
        return Auth.renderUI();
    }
};

window.Auth = Auth;

// Listen for MetaMask account changes (only if logged in with MetaMask)
if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (Auth.getLoginType() === 'metamask') {
            const currentWallet = Auth.getWallet();
            if (accounts.length === 0) {
                Auth.logout(true);
            } else if (currentWallet && accounts[0].toLowerCase() !== currentWallet.toLowerCase()) {
                Auth.logout(true);
            }
        }
    });
}

// Auto-inject modal, render UI, and attach listeners on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.injectModalDOM();
    Auth.renderUI();
});
