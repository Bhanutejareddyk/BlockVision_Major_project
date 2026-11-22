// Auth module for BlockVision-2.0
// Supports 3 Authentication Methods:
// 1. MetaMask / Web3 (Desktop & Mobile Deep-Link & WalletConnect)
// 2. Email OTP Login (Real-time Gmail SMTP dispatch, permanent custodial wallet mapping)
// 3. Reusable Guest ID (e.g. GUEST-A7K9P2 - persistent history across sessions)

const Auth = {
    TOKEN_KEY: 'blockvision_token',
    WALLET_KEY: 'blockvision_wallet',
    LOGIN_TYPE_KEY: 'blockvision_login_type',
    EMAIL_KEY: 'blockvision_email',
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

    getEmail() {
        return localStorage.getItem(this.EMAIL_KEY) || '';
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

            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, walletAddress]
            });

            const loginRes = await fetch(`${apiBase}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress, nonce, signature })
            });

            const loginData = await loginRes.json();
            if (!loginRes.ok || !loginData.success) {
                throw new Error(loginData.error || 'Signature verification failed.');
            }

            localStorage.setItem(this.TOKEN_KEY, loginData.token);
            localStorage.setItem(this.WALLET_KEY, loginData.wallet.toLowerCase());
            localStorage.setItem(this.LOGIN_TYPE_KEY, 'metamask');
            localStorage.removeItem(this.EMAIL_KEY);
            localStorage.removeItem(this.GUEST_ID_KEY);
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

    async loginWithWalletConnect() {
        try {
            if (typeof WalletConnectProvider === 'undefined') {
                Utils.showToast('WalletConnect', 'WalletConnect library loading... If not available, please use Email or MetaMask.', 'info');
                return;
            }

            const provider = new WalletConnectProvider.default({
                rpc: { 11155111: "https://rpc.sepolia.org" }
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
    // OPTION 2: EMAIL LOGIN (Real-Time Gmail OTP, Permanent Custodial Wallet)
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
            throw new Error(data.error || 'Failed to dispatch verification code via SMTP.');
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

        localStorage.setItem(this.TOKEN_KEY, data.token);
        localStorage.setItem(this.WALLET_KEY, data.wallet.toLowerCase());
        localStorage.setItem(this.LOGIN_TYPE_KEY, 'email');
        localStorage.setItem(this.EMAIL_KEY, data.email.toLowerCase());
        localStorage.removeItem(this.GUEST_ID_KEY);
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
    // OPTION 3: GUEST ID (Reusable Guest Mode with Persistent History)
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

        // Save session
        localStorage.setItem(this.TOKEN_KEY, data.token);
        localStorage.setItem(this.WALLET_KEY, data.wallet.toLowerCase());
        localStorage.setItem(this.LOGIN_TYPE_KEY, 'guest');
        localStorage.setItem(this.GUEST_ID_KEY, data.guestId);
        localStorage.removeItem(this.EMAIL_KEY);
        const expiresInMs = (data.expiresIn || 86400) * 1000;
        localStorage.setItem(this.EXPIRES_KEY, String(Date.now() + expiresInMs));

        return data;
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

        localStorage.setItem(this.TOKEN_KEY, data.token);
        localStorage.setItem(this.WALLET_KEY, data.wallet.toLowerCase());
        localStorage.setItem(this.LOGIN_TYPE_KEY, 'guest');
        localStorage.setItem(this.GUEST_ID_KEY, data.guestId);
        localStorage.removeItem(this.EMAIL_KEY);
        const expiresInMs = (data.expiresIn || 86400) * 1000;
        localStorage.setItem(this.EXPIRES_KEY, String(Date.now() + expiresInMs));

        if (typeof Utils !== 'undefined' && Utils.showToast) {
            Utils.showToast('Guest Session Loaded', `Logged in with Guest ID: ${data.guestId}`, 'success');
        }

        this.closeLoginModal();
        this.renderUI();
        window.dispatchEvent(new CustomEvent('auth:login', { detail: { wallet: data.wallet, loginType: 'guest', guestId: data.guestId } }));
        return data;
    },

    logout(reload = true) {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.WALLET_KEY);
        localStorage.removeItem(this.LOGIN_TYPE_KEY);
        localStorage.removeItem(this.EMAIL_KEY);
        localStorage.removeItem(this.EXPIRES_KEY);
        // Note: We leave GUEST_ID_KEY in localStorage so the guest login input can prefill it!
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

            // Auto-suggest saved guest ID if opening guest tab
            const guestInput = document.getElementById('authGuestIdInput');
            if (guestInput && !guestInput.value) {
                const savedGid = this.getGuestId();
                if (savedGid) guestInput.value = savedGid;
            }
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

        const tabs = modal.querySelectorAll('.bv-tab');
        tabs.forEach(t => {
            if (t.dataset.tab === tabName) t.classList.add('active');
            else t.classList.remove('active');
        });

        const panes = modal.querySelectorAll('.bv-tab-pane');
        panes.forEach(p => {
            if (p.id === `tabPane-${tabName}`) p.classList.add('active');
            else p.classList.remove('active');
        });
    },

    injectModalDOM() {
        if (document.getElementById('authModal')) return;

        const hasExtension = this.isMetaMaskInstalled();
        const isMob = this.isMobile();
        const savedGid = this.getGuestId();

        const modalHtml = `
        <div id="authModal" class="bv-modal" aria-hidden="true" role="dialog" aria-modal="true">
            <div class="bv-modal-backdrop" id="authModalBackdrop"></div>
            <div class="bv-modal-dialog">
                <div class="bv-modal-header">
                    <div>
                        <h3 class="bv-modal-title">Sign In to BlockVision</h3>
                        <p class="bv-modal-subtitle">Choose your preferred sign-in method</p>
                    </div>
                    <button type="button" class="bv-modal-close" id="authModalClose" aria-label="Close modal">&times;</button>
                </div>

                <!-- 3 Options Tabs -->
                <div class="bv-tabs">
                    <button type="button" class="bv-tab active" data-tab="metamask">MetaMask</button>
                    <button type="button" class="bv-tab" data-tab="email">Email OTP</button>
                    <button type="button" class="bv-tab" data-tab="guest">Guest ID</button>
                </div>

                <!-- TAB 1: MetaMask / Web3 -->
                <div class="bv-tab-pane active" id="tabPane-metamask">
                    ${hasExtension ? `
                        <div class="bv-card-info">Connect your Web3 browser extension (MetaMask / Brave / Coinbase) on Sepolia Testnet.</div>
                        <button type="button" class="bv-btn bv-btn-metamask" id="btnConnectMetaMask">Connect with MetaMask</button>
                    ` : `
                        <div class="bv-card-info" style="border-left: 3px solid #f59e0b;">
                            <strong>No Web3 extension detected in this browser.</strong><br>
                            ${isMob ? 'Tap below to open directly in the MetaMask mobile app, or scan with WalletConnect.' : 'Install MetaMask for desktop Chrome, or use <strong>Email OTP</strong> or <strong>Guest ID</strong> with zero installation.'}
                        </div>
                        ${isMob ? `<button type="button" class="bv-btn bv-btn-metamask" id="btnOpenMetaMaskApp" style="margin-bottom: 10px;">Open in MetaMask App</button>` : ''}
                        <button type="button" class="bv-btn bv-btn-secondary" id="btnConnectWalletConnect" style="margin-bottom: 10px;">Connect with WalletConnect</button>
                        <div style="text-align: center; margin-top: 12px; font-size: 12px;">
                            <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" style="color: #0071e3; text-decoration: underline;">Download MetaMask Browser Extension &rarr;</a>
                        </div>
                    `}
                </div>

                <!-- TAB 2: Email OTP Login (Real-time Gmail SMTP) -->
                <div class="bv-tab-pane" id="tabPane-email">
                    <div id="emailStepRequest">
                        <div class="bv-card-info">
                            Enter your real Gmail or email address. A real-time 6-digit verification code will be sent to your inbox.
                        </div>
                        <div id="emailRequestErrorNotice" style="display: none; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 12px;"></div>
                        <div class="bv-form-group">
                            <label class="bv-label" for="authEmailInput">Gmail / Email Address</label>
                            <input type="email" id="authEmailInput" class="bv-input" placeholder="e.g. yourname@gmail.com" autocomplete="email">
                        </div>
                        <button type="button" class="bv-btn bv-btn-primary" id="btnRequestOtp">
                            <span id="btnRequestOtpText">Send 6-Digit Code</span>
                        </button>
                    </div>

                    <div id="emailStepVerify" style="display: none;">
                        <div class="bv-card-info" style="border-left: 3px solid #10b981;">
                            <strong>OTP sent to your Gmail!</strong><br>
                            Please check your <strong>Inbox and Spam folder</strong> at <span id="authEmailTarget" style="font-weight: 700;"></span>.
                        </div>
                        <div id="emailVerifyErrorNotice" style="display: none; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 12px;"></div>
                        <div class="bv-form-group" style="margin-top: 14px;">
                            <label class="bv-label" for="authOtpInput">Enter 6-Digit Code</label>
                            <input type="text" id="authOtpInput" class="bv-input" placeholder="123456" maxlength="6" inputmode="numeric" pattern="[0-9]*" style="letter-spacing: 6px; font-size: 22px; font-weight: 700; text-align: center; font-family: monospace;">
                        </div>
                        <button type="button" class="bv-btn bv-btn-primary" id="btnVerifyOtp" style="margin-bottom: 10px;">
                            <span>Verify & Sign In</span>
                        </button>
                        <div style="display: flex; gap: 8px; justify-content: space-between;">
                            <button type="button" class="bv-btn bv-btn-secondary" id="btnResendOtp" style="flex: 1; font-size: 12px;">
                                <span>Resend OTP</span>
                            </button>
                            <button type="button" class="bv-btn bv-btn-secondary" id="btnBackToEmail" style="flex: 1; font-size: 12px;">
                                <span>Change Email</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- TAB 3: Guest ID (Reusable Login + History Persistence) -->
                <div class="bv-tab-pane" id="tabPane-guest">
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <!-- Section A: Login with existing Guest ID -->
                        <div class="bv-card-info" style="border-left: 3px solid #0071e3; margin-bottom: 0;">
                            <strong style="color: #0f172a;">Already have a Guest ID?</strong>
                            <p style="margin: 4px 0 10px 0; font-size: 12px; color: #64748b;">Enter your previously saved Guest ID to resume your session and restore your upload history.</p>
                            <div style="display: flex; gap: 8px;">
                                <input type="text" id="authGuestIdInput" class="bv-input" placeholder="GUEST-XXXXXX" value="${savedGid || ''}" maxlength="12" style="text-transform: uppercase; letter-spacing: 2px; font-weight: 700; font-family: monospace; font-size: 14px;">
                                <button type="button" class="bv-btn bv-btn-primary" id="btnGuestLoginExisting" style="width: auto; padding: 0 16px; white-space: nowrap;">Log In</button>
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
                                <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Generates a reusable Guest ID with a persistent custodial wallet. No wallet extension or email required.</p>
                            </div>
                            <button type="button" class="bv-btn bv-btn-guest" id="btnCreateGuest">
                                <span>Create New Guest ID</span>
                            </button>
                        </div>

                        <!-- Generated ID Card -->
                        <div id="guestCreatedCard" style="display: none; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; text-align: center;">
                            <div style="font-size: 11px; font-weight: 700; color: #065f46; text-transform: uppercase; letter-spacing: 1px;">Your Guest ID — Save It!</div>
                            <div id="newGuestIdDisplay" style="font-size: 22px; font-weight: 800; font-family: monospace; letter-spacing: 3px; color: #047857; margin: 8px 0; user-select: all;"></div>
                            <p style="font-size: 12px; color: #047857; margin-bottom: 12px;">Save this ID to log back in anytime and view all your photos.</p>
                            <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                                <button type="button" class="bv-btn bv-btn-secondary" id="btnCopyGuestId" style="font-size: 12px; padding: 6px 12px; min-height: 34px; width: auto;">Copy ID</button>
                                <button type="button" class="bv-btn bv-btn-secondary" id="btnDownloadGuestTxt" style="font-size: 12px; padding: 6px 12px; min-height: 34px; width: auto;">Download .txt</button>
                                <button type="button" class="bv-btn bv-btn-guest" id="btnEnterGuestSession" style="font-size: 12px; padding: 6px 14px; min-height: 34px; width: auto;">Enter Dashboard &rarr;</button>
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
        if (btnMetaMask) btnMetaMask.onclick = () => this.loginWithWallet();

        const btnOpenMetaMaskApp = document.getElementById('btnOpenMetaMaskApp');
        if (btnOpenMetaMaskApp) btnOpenMetaMaskApp.onclick = () => this.openMetaMaskMobile();

        const btnWalletConnect = document.getElementById('btnConnectWalletConnect');
        if (btnWalletConnect) btnWalletConnect.onclick = () => this.loginWithWalletConnect();

        // Option 2 Buttons & Flow
        const emailInput = document.getElementById('authEmailInput');
        const otpInput = document.getElementById('authOtpInput');
        const btnRequestOtp = document.getElementById('btnRequestOtp');
        const btnVerifyOtp = document.getElementById('btnVerifyOtp');
        const btnResendOtp = document.getElementById('btnResendOtp');
        const btnBackToEmail = document.getElementById('btnBackToEmail');
        const stepRequest = document.getElementById('emailStepRequest');
        const stepVerify = document.getElementById('emailStepVerify');
        const emailTarget = document.getElementById('authEmailTarget');
        const reqErrNotice = document.getElementById('emailRequestErrorNotice');
        const verErrNotice = document.getElementById('emailVerifyErrorNotice');

        let resendTimer = null;

        const startResendCountdown = () => {
            if (!btnResendOtp) return;
            let countdown = 30;
            btnResendOtp.disabled = true;
            btnResendOtp.textContent = `Resend in ${countdown}s`;
            clearInterval(resendTimer);
            resendTimer = setInterval(() => {
                countdown--;
                if (countdown <= 0) {
                    clearInterval(resendTimer);
                    btnResendOtp.disabled = false;
                    btnResendOtp.textContent = 'Resend OTP';
                } else {
                    btnResendOtp.textContent = `Resend in ${countdown}s`;
                }
            }, 1000);
        };

        const handleSendOtp = async () => {
            const email = emailInput ? emailInput.value.trim() : '';
            if (!email) {
                if (reqErrNotice) {
                    reqErrNotice.textContent = 'Please enter your Gmail / email address.';
                    reqErrNotice.style.display = 'block';
                } else {
                    alert('Please enter your email address.');
                }
                return;
            }
            if (reqErrNotice) reqErrNotice.style.display = 'none';
            if (verErrNotice) verErrNotice.style.display = 'none';

            btnRequestOtp.disabled = true;
            const textSpan = document.getElementById('btnRequestOtpText');
            if (textSpan) textSpan.textContent = 'Sending OTP...';

            try {
                const data = await this.requestEmailOtp(email);
                if (emailTarget) emailTarget.textContent = email;
                if (stepRequest) stepRequest.style.display = 'none';
                if (stepVerify) stepVerify.style.display = 'block';
                if (otpInput) {
                    otpInput.value = '';
                    otpInput.focus();
                }
                startResendCountdown();
                if (typeof Utils !== 'undefined' && Utils.showToast) {
                    Utils.showToast('OTP Dispatched', 'Verification code sent to your Gmail. Check Inbox + Spam.', 'success');
                }
            } catch (err) {
                console.error('Email request error:', err);
                const msg = err.message || 'Failed to dispatch OTP code via SMTP.';
                if (reqErrNotice) {
                    reqErrNotice.textContent = msg;
                    reqErrNotice.style.display = 'block';
                }
                if (typeof Utils !== 'undefined' && Utils.showToast) {
                    Utils.showToast('SMTP Error', msg, 'error');
                }
            } finally {
                btnRequestOtp.disabled = false;
                if (textSpan) textSpan.textContent = 'Send 6-Digit Code';
            }
        };

        if (btnRequestOtp) btnRequestOtp.onclick = handleSendOtp;

        if (btnResendOtp) {
            btnResendOtp.onclick = async () => {
                const email = emailInput ? emailInput.value.trim() : '';
                if (!email) return;
                btnResendOtp.disabled = true;
                btnResendOtp.textContent = 'Resending...';
                try {
                    await this.requestEmailOtp(email);
                    startResendCountdown();
                    if (verErrNotice) verErrNotice.style.display = 'none';
                    if (typeof Utils !== 'undefined' && Utils.showToast) {
                        Utils.showToast('OTP Resent', 'New code sent to your Gmail.', 'success');
                    }
                } catch (err) {
                    if (verErrNotice) {
                        verErrNotice.textContent = err.message || 'Failed to resend code.';
                        verErrNotice.style.display = 'block';
                    }
                    btnResendOtp.disabled = false;
                    btnResendOtp.textContent = 'Resend OTP';
                }
            };
        }

        if (btnVerifyOtp) {
            btnVerifyOtp.onclick = async () => {
                const email = emailInput ? emailInput.value.trim() : '';
                const otp = otpInput ? otpInput.value.trim() : '';
                if (!otp || otp.length < 6) {
                    if (verErrNotice) {
                        verErrNotice.textContent = 'Please enter the 6-digit verification code from your Gmail.';
                        verErrNotice.style.display = 'block';
                    } else {
                        alert('Please enter the 6-digit verification code.');
                    }
                    return;
                }
                if (verErrNotice) verErrNotice.style.display = 'none';

                btnVerifyOtp.disabled = true;
                btnVerifyOtp.textContent = 'Verifying...';
                try {
                    await this.loginWithEmail(email, otp);
                } catch (err) {
                    const msg = err.message || 'Verification failed.';
                    if (verErrNotice) {
                        verErrNotice.textContent = msg;
                        verErrNotice.style.display = 'block';
                    }
                    if (typeof Utils !== 'undefined' && Utils.showToast) {
                        Utils.showToast('Verification Failed', msg, 'error');
                    }
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

        // Option 3: Guest ID Flow
        const guestIdInput = document.getElementById('authGuestIdInput');
        const btnGuestLoginExisting = document.getElementById('btnGuestLoginExisting');
        const btnCreateGuest = document.getElementById('btnCreateGuest');
        const guestCreatedCard = document.getElementById('guestCreatedCard');
        const newGuestIdDisplay = document.getElementById('newGuestIdDisplay');
        const btnCopyGuestId = document.getElementById('btnCopyGuestId');
        const btnDownloadGuestTxt = document.getElementById('btnDownloadGuestTxt');
        const btnEnterGuestSession = document.getElementById('btnEnterGuestSession');

        let createdGuestData = null;

        if (btnGuestLoginExisting) {
            btnGuestLoginExisting.onclick = async () => {
                const gid = guestIdInput ? guestIdInput.value.trim() : '';
                if (!gid) {
                    alert('Please enter your Guest ID (e.g. GUEST-A7K9P2).');
                    return;
                }
                btnGuestLoginExisting.disabled = true;
                btnGuestLoginExisting.textContent = 'Logging In...';
                try {
                    await this.loginWithGuestId(gid);
                } catch (err) {
                    alert(err.message || 'Could not log in with Guest ID.');
                } finally {
                    btnGuestLoginExisting.disabled = false;
                    btnGuestLoginExisting.textContent = 'Log In';
                }
            };
        }

        if (btnCreateGuest) {
            btnCreateGuest.onclick = async () => {
                btnCreateGuest.disabled = true;
                btnCreateGuest.textContent = 'Generating Guest ID...';
                try {
                    createdGuestData = await this.createGuestAccount();
                    if (newGuestIdDisplay) newGuestIdDisplay.textContent = createdGuestData.guestId;
                    if (guestCreatedCard) guestCreatedCard.style.display = 'block';
                    if (guestIdInput) guestIdInput.value = createdGuestData.guestId;
                } catch (err) {
                    alert(err.message || 'Could not create Guest ID.');
                } finally {
                    btnCreateGuest.disabled = false;
                    btnCreateGuest.textContent = 'Create New Guest ID';
                }
            };
        }

        if (btnCopyGuestId) {
            btnCopyGuestId.onclick = () => {
                const gid = createdGuestData?.guestId || (newGuestIdDisplay ? newGuestIdDisplay.textContent : '');
                if (gid && typeof Utils !== 'undefined') {
                    Utils.copyToClipboard(gid);
                }
            };
        }

        if (btnDownloadGuestTxt) {
            btnDownloadGuestTxt.onclick = () => {
                const gid = createdGuestData?.guestId || (newGuestIdDisplay ? newGuestIdDisplay.textContent : '');
                const wallet = createdGuestData?.wallet || '';
                const text = `BlockVision Digital Asset Provenance\nYour Guest ID: ${gid}\nCustodial Wallet: ${wallet}\nNetwork: Ethereum Sepolia Testnet\nWebsite: https://blockvision-nu.vercel.app\n\nKeep this Guest ID safe to restore your photos and view history anytime.\n`;
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `blockvision-${gid}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };
        }

        if (btnEnterGuestSession) {
            btnEnterGuestSession.onclick = () => {
                if (createdGuestData) {
                    if (typeof Utils !== 'undefined' && Utils.showToast) {
                        Utils.showToast('Guest Session Active', `Signed in as ${createdGuestData.guestId}`, 'success');
                    }
                    this.closeLoginModal();
                    this.renderUI();
                    window.dispatchEvent(new CustomEvent('auth:login', { detail: { wallet: createdGuestData.wallet, loginType: 'guest', guestId: createdGuestData.guestId } }));
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
            const guestId = this.getGuestId();
            const etherscanUrl = `https://sepolia.etherscan.io/address/${wallet}`;

            let labelHtml = '';
            let indicatorColor = '#34c759'; // Green for metamask

            if (loginType === 'email') {
                indicatorColor = '#0071e3'; // Blue
                labelHtml = `<span title="${userEmail} (${wallet})">${userEmail ? userEmail.split('@')[0] : shortAddr}</span>`;
            } else if (loginType === 'guest') {
                indicatorColor = '#f59e0b'; // Amber
                const displayId = guestId || 'Guest';
                labelHtml = `
                    <span title="Guest ID: ${displayId} (${wallet})">${displayId} (${shortAddr})</span>
                    <button type="button" class="wallet-logout-btn" id="guestCopyHeaderBtn" title="Copy Guest ID" style="color: #f59e0b; margin-left: 2px;">Copy</button>
                `;
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

            const copyHeaderBtn = document.getElementById('guestCopyHeaderBtn');
            if (copyHeaderBtn && guestId) {
                copyHeaderBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (typeof Utils !== 'undefined') {
                        Utils.copyToClipboard(guestId);
                    }
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
