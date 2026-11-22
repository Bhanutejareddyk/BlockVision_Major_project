// Auth module for BlockVision-2.0
// Supports 3 Authentication Methods:
// 1. MetaMask / Web3 (Desktop & Mobile Deep-Link & WalletConnect)
// 2. Email OTP Login (Custodial wallet derived on backend, zero wallet needed)
// 3. Guest / Demo Mode (Instant 1-click access for viva demonstration)

const Auth = {
    TOKEN_KEY: 'blockvision_token',
    WALLET_KEY: 'blockvision_wallet',
    LOGIN_TYPE_KEY: 'blockvision_login_type',
    EMAIL_KEY: 'blockvision_email',
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

    // Get current session token
    getToken() {
        return localStorage.getItem(this.TOKEN_KEY) || '';
    },

    // Get current wallet address
    getWallet() {
        return localStorage.getItem(this.WALLET_KEY) || '';
    },

    // Get login type: 'metamask' | 'email' | 'guest'
    getLoginType() {
        return localStorage.getItem(this.LOGIN_TYPE_KEY) || 'metamask';
    },

    // Get user email (for email login)
    getEmail() {
        return localStorage.getItem(this.EMAIL_KEY) || '';
    },

    // Authorization headers for fetch requests
    authHeaders() {
        const token = this.getToken();
        if (token) {
            return { 'Authorization': `Bearer ${token}` };
        }
        return {};
    },

    // Format address for display
    formatAddress(addr) {
        if (!addr) return '';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    },

    // Check authentication and open modal if not logged in
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

    // Request account access from MetaMask
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

    // Deep link redirect for mobile users
    openMetaMaskMobile() {
        const currentPath = window.location.host + window.location.pathname + window.location.search;
        const deepLink = `https://metamask.app.link/dapp/${currentPath}`;
        window.location.href = deepLink;
    },

    // Complete MetaMask login flow
    async loginWithWallet() {
        try {
            if (!this.isMetaMaskInstalled()) {
                if (this.isMobile()) {
                    this.openMetaMaskMobile();
                    return;
                }
                this.openLoginModal('metamask');
                throw new Error('MetaMask is not installed. Please install MetaMask or use Email / Guest login.');
            }

            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Connecting', 'Connecting to your MetaMask wallet...', 'info');
            }

            const walletAddress = await this.connectWallet();
            const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';

            // 1. Request nonce challenge
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

            // 2. Request signature
            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, walletAddress]
            });

            // 3. Verify on backend
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
            localStorage.setItem(this.LOGIN_TYPE_KEY, 'metamask');
            localStorage.removeItem(this.EMAIL_KEY);
            const expiresInMs = (loginData.expiresIn || 86400) * 1000;
            localStorage.setItem(this.EXPIRES_KEY, String(Date.now() + expiresInMs));

            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Signed In', `Logged in via MetaMask: ${this.formatAddress(walletAddress)}`, 'success');
            }

            this.closeLoginModal();
            this.renderUI();
            window.dispatchEvent(new CustomEvent('auth:login', { detail: { wallet: loginData.wallet, loginType: 'metamask' } }));
            return loginData.wallet;

        } catch (error) {
            console.error('MetaMask login failed:', error);
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Login Notice', error.message || 'Could not log in with MetaMask', 'info');
            }
            throw error;
        }
    },

    // WalletConnect support (Trust Wallet, Rainbow, mobile wallets)
    async loginWithWalletConnect() {
        try {
            if (typeof WalletConnectProvider === 'undefined') {
                Utils.showToast('WalletConnect', 'WalletConnect library loading... If not available, please use Email or MetaMask.', 'info');
                return;
            }

            const provider = new WalletConnectProvider.default({
                rpc: {
                    11155111: "https://rpc.sepolia.org"
                }
            });

            await provider.enable();
            const accounts = provider.accounts;
            if (!accounts || accounts.length === 0) {
                throw new Error('No account found in WalletConnect.');
            }

            const walletAddress = accounts[0].toLowerCase();
            const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';

            const nonceRes = await fetch(`${apiBase}/api/auth/nonce`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress })
            });
            const nonceData = await nonceRes.json();
            const { nonce, message } = nonceData;

            // Sign personal_sign via provider
            const signature = await provider.request({
                method: 'personal_sign',
                params: [message, walletAddress]
            });

            const loginRes = await fetch(`${apiBase}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress, nonce, signature })
            });
            const loginData = await loginRes.json();

            localStorage.setItem(this.TOKEN_KEY, loginData.token);
            localStorage.setItem(this.WALLET_KEY, loginData.wallet.toLowerCase());
            localStorage.setItem(this.LOGIN_TYPE_KEY, 'metamask');
            const expiresInMs = (loginData.expiresIn || 86400) * 1000;
            localStorage.setItem(this.EXPIRES_KEY, String(Date.now() + expiresInMs));

            this.closeLoginModal();
            this.renderUI();
            window.dispatchEvent(new CustomEvent('auth:login', { detail: { wallet: loginData.wallet, loginType: 'metamask' } }));
            return loginData.wallet;

        } catch (err) {
            console.error('WalletConnect error:', err);
            Utils.showToast('WalletConnect', err.message || 'Connection cancelled', 'warning');
        }
    },

    // =========================================================================
    // OPTION 2: EMAIL LOGIN (Custodial Wallet, zero extensions)
    // =========================================================================

    async requestEmailOtp(email) {
        if (!email || !email.includes('@') || !email.includes('.')) {
            throw new Error('Please enter a valid email address.');
        }

        const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
        const res = await fetch(`${apiBase}/api/auth/email-request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.trim().toLowerCase() })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Failed to send OTP code.');
        }
        return data;
    },

    async loginWithEmail(email, otp) {
        if (!email || !otp) {
            throw new Error('Email and verification code are required.');
        }

        const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
        const res = await fetch(`${apiBase}/api/auth/email-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email.trim().toLowerCase(),
                otp: otp.trim()
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Invalid verification code.');
        }

        // Save session
        localStorage.setItem(this.TOKEN_KEY, data.token);
        localStorage.setItem(this.WALLET_KEY, data.wallet.toLowerCase());
        localStorage.setItem(this.LOGIN_TYPE_KEY, 'email');
        localStorage.setItem(this.EMAIL_KEY, data.email.toLowerCase());
        const expiresInMs = (data.expiresIn || 86400) * 1000;
        localStorage.setItem(this.EXPIRES_KEY, String(Date.now() + expiresInMs));

        if (typeof Utils !== 'undefined' && Utils.showToast) {
            Utils.showToast('Logged In', `Welcome back, ${data.email}!`, 'success');
        }

        this.closeLoginModal();
        this.renderUI();
        window.dispatchEvent(new CustomEvent('auth:login', { detail: { wallet: data.wallet, loginType: 'email', email: data.email } }));
        return data;
    },

    // =========================================================================
    // OPTION 3: GUEST / DEMO MODE (Instant 1-Click Access)
    // =========================================================================

    async loginAsGuest() {
        try {
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Guest Mode', 'Starting instant demo session...', 'info');
            }

            const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
            const res = await fetch(`${apiBase}/api/auth/guest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Could not initialize guest session.');
            }

            // Save guest session
            localStorage.setItem(this.TOKEN_KEY, data.token);
            localStorage.setItem(this.WALLET_KEY, data.wallet.toLowerCase());
            localStorage.setItem(this.LOGIN_TYPE_KEY, 'guest');
            localStorage.removeItem(this.EMAIL_KEY);
            const expiresInMs = (data.expiresIn || 86400) * 1000;
            localStorage.setItem(this.EXPIRES_KEY, String(Date.now() + expiresInMs));

            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Guest Session Active', 'You are browsing in Demo Mode (Upload & Verify enabled)', 'success');
            }

            this.closeLoginModal();
            this.renderUI();
            window.dispatchEvent(new CustomEvent('auth:login', { detail: { wallet: data.wallet, loginType: 'guest' } }));
            return data;

        } catch (err) {
            console.error('Guest login failed:', err);
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Demo Error', err.message || 'Could not start guest session', 'error');
            }
            throw err;
        }
    },

    // Log out user
    logout(reload = true) {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.WALLET_KEY);
        localStorage.removeItem(this.LOGIN_TYPE_KEY);
        localStorage.removeItem(this.EMAIL_KEY);
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
        let modal = document.getElementById('authModal');
        if (!modal) {
            this.injectModalDOM();
            modal = document.getElementById('authModal');
        }

        if (modal) {
            this.switchModalTab(defaultTab);
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
    },

    closeLoginModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.remove('active');
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
    },

    switchModalTab(tabName) {
        const modal = document.getElementById('authModal');
        if (!modal) return;

        // Update tab buttons
        const tabs = modal.querySelectorAll('.bv-tab');
        tabs.forEach(t => {
            if (t.dataset.tab === tabName) {
                t.classList.add('active');
            } else {
                t.classList.remove('active');
            }
        });

        // Update tab panes
        const panes = modal.querySelectorAll('.bv-tab-pane');
        panes.forEach(p => {
            if (p.id === `tabPane-${tabName}`) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
    },

    injectModalDOM() {
        if (document.getElementById('authModal')) return;

        const hasExtension = this.isMetaMaskInstalled();
        const isMob = this.isMobile();

        const modalHtml = `
        <div id="authModal" class="bv-modal" aria-hidden="true" role="dialog" aria-modal="true">
            <div class="bv-modal-backdrop" id="authModalBackdrop"></div>
            <div class="bv-modal-dialog">
                <div class="bv-modal-header">
                    <div>
                        <h3 class="bv-modal-title">Sign In to BlockVision</h3>
                        <p class="bv-modal-subtitle">Choose how you would like to connect</p>
                    </div>
                    <button type="button" class="bv-modal-close" id="authModalClose" aria-label="Close modal">&times;</button>
                </div>

                <!-- 3 Login Options Tabs -->
                <div class="bv-tabs">
                    <button type="button" class="bv-tab active" data-tab="metamask">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M21.9 8.8l-8.5-6.2a2.3 2.3 0 0 0-2.8 0L2.1 8.8A2 2 0 0 0 1.3 11v8a2 2 0 0 0 2 2h17.4a2 2 0 0 0 2-2v-8a2 2 0 0 0-.8-2.2zM12 4.4l7.6 5.5-2.4 1.7-5.2-3.8-5.2 3.8-2.4-1.7L12 4.4z"/>
                        </svg>
                        <span>MetaMask</span>
                    </button>
                    <button type="button" class="bv-tab" data-tab="email">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                            <polyline points="22,6 12,13 2,6"/>
                        </svg>
                        <span>Email OTP</span>
                    </button>
                    <button type="button" class="bv-tab" data-tab="guest">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="7" r="4"/>
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        </svg>
                        <span>Guest Demo</span>
                    </button>
                </div>

                <!-- TAB 1: MetaMask / Web3 -->
                <div class="bv-tab-pane active" id="tabPane-metamask">
                    ${hasExtension ? `
                        <div class="bv-card-info">
                            Connect your Web3 browser extension (MetaMask / Brave / Coinbase) on Sepolia Testnet.
                        </div>
                        <button type="button" class="bv-btn bv-btn-metamask" id="btnConnectMetaMask">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
                                <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
                                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
                            </svg>
                            <span>Connect with MetaMask</span>
                        </button>
                    ` : `
                        <div class="bv-card-info" style="border-left: 3px solid #f59e0b;">
                            <strong>No Web3 extension detected in this browser.</strong><br>
                            ${isMob ? 'Tap below to open directly in the MetaMask mobile app, or scan with WalletConnect.' : 'Install MetaMask for desktop Chrome, or use <strong>Email OTP</strong> or <strong>Guest Demo</strong> above with zero installation.'}
                        </div>
                        ${isMob ? `
                            <button type="button" class="bv-btn bv-btn-metamask" id="btnOpenMetaMaskApp" style="margin-bottom: 10px;">
                                <span>Open in MetaMask App</span>
                            </button>
                        ` : ''}
                        <button type="button" class="bv-btn bv-btn-secondary" id="btnConnectWalletConnect" style="margin-bottom: 10px;">
                            <span>Connect with WalletConnect</span>
                        </button>
                        <div style="text-align: center; margin-top: 12px; font-size: 12px;">
                            <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" style="color: #0071e3; text-decoration: underline;">
                                Download MetaMask Browser Extension &rarr;
                            </a>
                        </div>
                    `}
                </div>

                <!-- TAB 2: Email OTP Login -->
                <div class="bv-tab-pane" id="tabPane-email">
                    <div id="emailStepRequest">
                        <div class="bv-card-info">
                            Sign in with your email address. A deterministic Ethereum custodial address is derived on our secure server, enabling permanent asset registration without needing any crypto wallet.
                        </div>
                        <div class="bv-form-group">
                            <label class="bv-label" for="authEmailInput">Email Address</label>
                            <input type="email" id="authEmailInput" class="bv-input" placeholder="e.g. yourname@gmail.com" autocomplete="email">
                        </div>
                        <button type="button" class="bv-btn bv-btn-primary" id="btnRequestOtp">
                            <span>Send 6-Digit Code</span>
                        </button>
                    </div>

                    <div id="emailStepVerify" style="display: none;">
                        <div class="bv-card-info">
                            We generated a 6-digit verification code for <strong id="authEmailTarget"></strong>.
                        </div>
                        <div id="authDemoOtpBadgeContainer"></div>
                        <div class="bv-form-group" style="margin-top: 12px;">
                            <label class="bv-label" for="authOtpInput">Enter 6-Digit Code</label>
                            <input type="text" id="authOtpInput" class="bv-input" placeholder="123456" maxlength="6" inputmode="numeric" pattern="[0-9]*" style="letter-spacing: 4px; font-size: 18px; text-align: center;">
                        </div>
                        <button type="button" class="bv-btn bv-btn-primary" id="btnVerifyOtp" style="margin-bottom: 8px;">
                            <span>Verify & Sign In</span>
                        </button>
                        <button type="button" class="bv-btn bv-btn-secondary" id="btnBackToEmail">
                            <span>Change Email Address</span>
                        </button>
                    </div>
                </div>

                <!-- TAB 3: Guest Demo Mode -->
                <div class="bv-tab-pane" id="tabPane-guest">
                    <div class="bv-card-info" style="border-left: 3px solid #10b981;">
                        <strong>Instant Demo Session (For Viva Presentation)</strong><br>
                        One-click instant access with an ephemeral Ethereum address.
                        <ul style="margin: 8px 0 0 16px; padding: 0;">
                            <li>Upload original photos & generate robust watermarks</li>
                            <li>Register immutable cryptographic provenance</li>
                            <li>Instant audit verification & tamper heatmap</li>
                            <li>Download official vector PDF certificates</li>
                        </ul>
                    </div>
                    <button type="button" class="bv-btn bv-btn-guest" id="btnGuestLogin">
                        <span>Continue as Guest (Instant Demo)</span>
                    </button>
                    <p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 10px;">
                        Note: Asset transfer and revocation require Email or MetaMask authentication.
                    </p>
                </div>
            </div>
        </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = modalHtml;
        document.body.appendChild(wrapper.firstElementChild);

        // Wire event listeners
        this.bindModalEvents();
    },

    bindModalEvents() {
        const modal = document.getElementById('authModal');
        if (!modal) return;

        // Close button & backdrop
        const closeBtn = document.getElementById('authModalClose');
        if (closeBtn) closeBtn.onclick = () => this.closeLoginModal();

        const backdrop = document.getElementById('authModalBackdrop');
        if (backdrop) backdrop.onclick = () => this.closeLoginModal();

        // Tabs
        const tabs = modal.querySelectorAll('.bv-tab');
        tabs.forEach(tab => {
            tab.onclick = () => this.switchModalTab(tab.dataset.tab);
        });

        // Option 1 Buttons
        const btnMetaMask = document.getElementById('btnConnectMetaMask');
        if (btnMetaMask) {
            btnMetaMask.onclick = async () => {
                try {
                    await this.loginWithWallet();
                } catch (e) {}
            };
        }

        const btnOpenMetaMaskApp = document.getElementById('btnOpenMetaMaskApp');
        if (btnOpenMetaMaskApp) {
            btnOpenMetaMaskApp.onclick = () => this.openMetaMaskMobile();
        }

        const btnWalletConnect = document.getElementById('btnConnectWalletConnect');
        if (btnWalletConnect) {
            btnWalletConnect.onclick = () => this.loginWithWalletConnect();
        }

        // Option 2 Buttons
        const emailInput = document.getElementById('authEmailInput');
        const otpInput = document.getElementById('authOtpInput');
        const btnRequestOtp = document.getElementById('btnRequestOtp');
        const btnVerifyOtp = document.getElementById('btnVerifyOtp');
        const btnBackToEmail = document.getElementById('btnBackToEmail');
        const stepRequest = document.getElementById('emailStepRequest');
        const stepVerify = document.getElementById('emailStepVerify');
        const emailTarget = document.getElementById('authEmailTarget');
        const demoOtpContainer = document.getElementById('authDemoOtpBadgeContainer');

        if (btnRequestOtp) {
            btnRequestOtp.onclick = async () => {
                const email = emailInput ? emailInput.value.trim() : '';
                if (!email) {
                    alert('Please enter your email address.');
                    return;
                }
                btnRequestOtp.disabled = true;
                btnRequestOtp.textContent = 'Sending Code...';
                try {
                    const data = await this.requestEmailOtp(email);
                    if (emailTarget) emailTarget.textContent = email;
                    if (demoOtpContainer) {
                        demoOtpContainer.innerHTML = '';
                        if (data.otp_for_demo) {
                            demoOtpContainer.innerHTML = `
                                <div class="bv-demo-pill" id="btnFillDemoOtp">
                                    <span>Demo Code: <strong>${data.otp_for_demo}</strong> (Click to auto-fill)</span>
                                </div>
                            `;
                            const fillPill = document.getElementById('btnFillDemoOtp');
                            if (fillPill && otpInput) {
                                fillPill.onclick = () => {
                                    otpInput.value = data.otp_for_demo;
                                };
                            }
                        }
                    }
                    if (stepRequest) stepRequest.style.display = 'none';
                    if (stepVerify) stepVerify.style.display = 'block';
                    if (otpInput) otpInput.focus();
                } catch (err) {
                    alert(err.message || 'Failed to send OTP code.');
                } finally {
                    btnRequestOtp.disabled = false;
                    btnRequestOtp.textContent = 'Send 6-Digit Code';
                }
            };
        }

        if (btnVerifyOtp) {
            btnVerifyOtp.onclick = async () => {
                const email = emailInput ? emailInput.value.trim() : '';
                const otp = otpInput ? otpInput.value.trim() : '';
                if (!otp || otp.length < 6) {
                    alert('Please enter the 6-digit verification code.');
                    return;
                }
                btnVerifyOtp.disabled = true;
                btnVerifyOtp.textContent = 'Verifying...';
                try {
                    await this.loginWithEmail(email, otp);
                } catch (err) {
                    alert(err.message || 'Verification failed.');
                } finally {
                    btnVerifyOtp.disabled = false;
                    btnVerifyOtp.textContent = 'Verify & Sign In';
                }
            };
        }

        if (btnBackToEmail) {
            btnBackToEmail.onclick = () => {
                if (stepVerify) stepVerify.style.display = 'none';
                if (stepRequest) stepRequest.style.display = 'block';
            };
        }

        // Option 3 Button
        const btnGuest = document.getElementById('btnGuestLogin');
        if (btnGuest) {
            btnGuest.onclick = async () => {
                btnGuest.disabled = true;
                btnGuest.textContent = 'Starting Demo Session...';
                try {
                    await this.loginAsGuest();
                } catch (err) {
                    alert(err.message || 'Could not start demo session.');
                } finally {
                    btnGuest.disabled = false;
                    btnGuest.textContent = 'Continue as Guest (Instant Demo)';
                }
            };
        }
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
            const userEmail = this.getEmail();
            const etherscanUrl = `https://sepolia.etherscan.io/address/${wallet}`;

            let labelHtml = '';
            let indicatorColor = '#34c759'; // Green for metamask

            if (loginType === 'email') {
                indicatorColor = '#0071e3'; // Blue
                labelHtml = `<span title="${userEmail} (${wallet})">${userEmail ? userEmail.split('@')[0] : shortAddr}</span>`;
            } else if (loginType === 'guest') {
                indicatorColor = '#f59e0b'; // Amber
                labelHtml = `<span title="Guest Demo (${wallet})">Guest (${shortAddr})</span>`;
            } else {
                labelHtml = `<a href="${etherscanUrl}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;" title="${wallet}">${shortAddr}</a>`;
            }

            navAuth.innerHTML = `
                <div class="wallet-badge" title="${wallet}">
                    <span class="wallet-indicator" style="background: ${indicatorColor}; box-shadow: 0 0 6px ${indicatorColor};" aria-hidden="true"></span>
                    ${labelHtml}
                    <button class="wallet-logout-btn" id="walletLogoutBtn" title="Log out" type="button">Log Out</button>
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
                    <span>Sign In / Connect</span>
                </button>
            `;
            const connectBtn = document.getElementById('connectWalletBtn');
            if (connectBtn) {
                connectBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    Auth.openLoginModal();
                });
            }
        }
    }
};

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

// Auto-inject modal and render UI on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    Auth.injectModalDOM();
    Auth.renderUI();
});
