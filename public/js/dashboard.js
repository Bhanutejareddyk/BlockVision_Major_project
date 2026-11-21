// BlockVision-2.0 Dashboard JavaScript
// Handles system stats, personal wallet analytics, and recent registrations

document.addEventListener('DOMContentLoaded', async () => {
    const statTotalImages = document.getElementById('statTotalImages');
    const statVerifiedImages = document.getElementById('statVerifiedImages');
    const statRevokedImages = document.getElementById('statRevokedImages');
    const statTotalOwners = document.getElementById('statTotalOwners');
    const recentImagesTableBody = document.getElementById('recentImagesTableBody');
    const refreshDashboardBtn = document.getElementById('refreshDashboard');

    const userWalletAddressDisplay = document.getElementById('userWalletAddressDisplay');
    const userWalletAction = document.getElementById('userWalletAction');
    const userStatsGrid = document.getElementById('userStatsGrid');
    const myTotalStat = document.getElementById('myTotalStat');
    const myActiveStat = document.getElementById('myActiveStat');
    const myRevokedStat = document.getElementById('myRevokedStat');
    const myTransferredStat = document.getElementById('myTransferredStat');

    // Modal elements
    const detailModal = document.getElementById('detailModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModalBtn = document.getElementById('closeModal');
    const modalBody = document.getElementById('modalBody');

    let recentImagesList = [];

    // Initialize
    await loadAllDashboardData();

    // Event listeners
    if (refreshDashboardBtn) {
        refreshDashboardBtn.addEventListener('click', async () => {
            Utils.showToast('Refreshing', 'Updating blockchain metrics...', 'info');
            await loadAllDashboardData();
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);

    window.addEventListener('auth:login', async () => {
        await loadAllDashboardData();
    });

    window.addEventListener('auth:logout', () => {
        updateUserSection(false);
    });

    async function loadAllDashboardData() {
        await loadPublicStats();
        await loadUserDashboard();
    }

    // Load Public System Stats from /api/stats
    async function loadPublicStats() {
        try {
            const data = await API.getStats();
            if (data && data.success !== false) {
                const total = data.totalImages ?? data.total_images_registered ?? 0;
                const active = data.totalActive ?? (total - (data.totalRevoked || 0));
                const verified = data.totalVerified ?? active;
                const revoked = data.totalRevoked ?? 0;
                const owners = data.totalOwners ?? (data.account_address ? 1 : 0);

                if (statTotalImages) statTotalImages.textContent = total;
                if (statVerifiedImages) statVerifiedImages.textContent = verified;
                if (statRevokedImages) statRevokedImages.textContent = revoked;
                if (statTotalOwners) statTotalOwners.textContent = owners;

                recentImagesList = data.recentImages || [];
                renderRecentImages(recentImagesList);
            } else {
                renderRecentImages([]);
            }
        } catch (err) {
            console.error('Failed to load public stats:', err);
            renderRecentImages([]);
            Utils.showToast('Error', 'Failed to fetch network statistics', 'error');
        }
    }

    // Load User Personal Stats from /api/dashboard
    async function loadUserDashboard() {
        const isLoggedIn = typeof Auth !== 'undefined' && Auth.isLoggedIn();
        if (!isLoggedIn) {
            updateUserSection(false);
            return;
        }

        const wallet = Auth.getWallet();
        updateUserSection(true, wallet);

        try {
            const userStats = await API.getDashboard();
            if (userStats && userStats.success) {
                if (myTotalStat) myTotalStat.textContent = userStats.myTotal ?? 0;
                if (myActiveStat) myActiveStat.textContent = userStats.myActive ?? 0;
                if (myRevokedStat) myRevokedStat.textContent = userStats.myRevoked ?? 0;
                if (myTransferredStat) myTransferredStat.textContent = userStats.myTransferred ?? 0;
            }
        } catch (err) {
            console.warn('Dashboard personal stats not available (auth issue):', err);
            if (err.status === 401) {
                updateUserSection(false);
            }
        }
    }

    function updateUserSection(isLoggedIn, wallet = '') {
        if (!userWalletAddressDisplay) return;

        if (isLoggedIn && wallet) {
            userWalletAddressDisplay.innerHTML = `Connected Wallet: <strong style="color: var(--primary);">${Utils.formatAddress(wallet)}</strong> (${wallet})`;
            if (userWalletAction) {
                userWalletAction.innerHTML = `
                    <button class="btn btn-secondary" style="font-size: 12px; padding: 4px 10px;" onclick="Auth.logout()">Disconnect</button>
                `;
            }
            if (userStatsGrid) userStatsGrid.style.display = 'grid';
        } else {
            userWalletAddressDisplay.textContent = 'Connect your MetaMask wallet to view your personal assets, active images, and transferred provenance.';
            if (userWalletAction) {
                userWalletAction.innerHTML = `
                    <button class="btn btn-primary" style="font-size: 13px; padding: 6px 14px;" onclick="Auth.loginWithWallet()">Connect Wallet</button>
                `;
            }
            if (userStatsGrid) userStatsGrid.style.display = 'none';
        }
    }

    // Render Recent Images Table
    function renderRecentImages(images) {
        if (!recentImagesTableBody) return;

        if (!images || images.length === 0) {
            recentImagesTableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                        No registered images found on the network yet.
                    </td>
                </tr>
            `;
            return;
        }

        recentImagesTableBody.innerHTML = images.map(img => {
            const isRevoked = Boolean(img.isRevoked);
            const cid = img.ipfsCID || img.ipfs_cid || '';
            const ipfsLink = img.ipfsUrl || (cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : '');

            return `
                <tr class="${isRevoked ? 'revoked-row' : ''}">
                    <td>
                        <div class="image-thumbnail">
                            <img src="${(typeof getApiBase === 'function' ? getApiBase() : '')}/api/image/${img.image_hash}" 
                                 alt="${img.filename || 'Image'}" 
                                 loading="lazy"
                                 onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22%3E%3Crect fill=%22%23e8e8ed%22 width=%2248%22 height=%2248%22/%3E%3C/svg%3E'">
                        </div>
                    </td>
                    <td data-label="Fingerprint">
                        <div class="hash-cell" title="${img.image_hash}">
                            ${img.image_hash.slice(0, 16)}...
                        </div>
                    </td>
                    <td data-label="Name" class="name-cell">${img.filename || 'Unknown'}</td>
                    <td data-label="Owner">
                        <div class="owner-cell" title="${img.owner}">
                            ${Utils.formatAddress(img.owner)}
                        </div>
                    </td>
                    <td data-label="Status" class="status-cell">
                        ${isRevoked 
                            ? '<span class="status-pill status-revoked" style="display:inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background: rgba(255, 59, 48, 0.15); color: #ff3b30; border: 1px solid rgba(255, 59, 48, 0.3);">Revoked</span>' 
                            : '<span class="status-pill status-active" style="display:inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background: rgba(52, 199, 89, 0.15); color: #34c759; border: 1px solid rgba(52, 199, 89, 0.3);">Active</span>'}
                    </td>
                    <td data-label="Date" class="date-cell">${img.timestamp ? Utils.formatDate(img.timestamp) : (img.registration_date || 'N/A')}</td>
                    <td data-label="IPFS" class="ipfs-cell">
                        ${cid 
                            ? `<a href="${ipfsLink}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-weight: 600;">View IPFS</a>` 
                            : '<span style="color: var(--text-muted);">-</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    function closeModal() {
        if (detailModal) detailModal.classList.remove('show');
    }
});
