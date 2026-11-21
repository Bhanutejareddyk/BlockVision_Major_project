// History Page JavaScript
// Handles transaction history and image listing

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const refreshHistoryBtn = document.getElementById('refreshHistory');
    const searchInput = document.getElementById('searchInput');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const historyTableBody = document.getElementById('historyTableBody');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const pagination = document.getElementById('pagination');
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    const exportCSVBtn = document.getElementById('exportCSV');
    
    // Stats Elements
    const statTotalImages = document.getElementById('statTotalImages');
    const statYourImages = document.getElementById('statYourImages');
    const statNetworkStatus = document.getElementById('statNetworkStatus');
    const statContractAddress = document.getElementById('statContractAddress');
    
    // Modal Elements
    const detailModal = document.getElementById('detailModal');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModalBtn = document.getElementById('closeModal');
    const modalBody = document.getElementById('modalBody');

    let allImages = [];
    let filteredImages = [];
    let currentPage = 1;
    let perPage = 20;
    let currentFilter = 'all';
    let userAddress = null;

    // Initialize
    await init();

    // Event Listeners
    refreshHistoryBtn.addEventListener('click', () => loadHistory());
    searchInput.addEventListener('input', handleSearch);
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => handleFilter(btn.dataset.filter));
    });
    prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
    nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
    exportCSVBtn.addEventListener('click', exportToCSV);
    closeModalBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', closeModal);

    window.addEventListener('auth:login', () => {
        userAddress = typeof Auth !== 'undefined' ? Auth.getWallet() : null;
        loadHistory();
    });
    window.addEventListener('auth:logout', () => {
        userAddress = null;
        loadHistory();
    });

    // Initialize function
    async function init() {
        // Load stats first to obtain backend account info
        await loadStats();
        
        // Load history
        await loadHistory();
    }

    // Load stats
    async function loadStats() {
        try {
            const stats = await API.getStats();
            
            if (stats && stats.success) {
                statTotalImages.textContent = stats.total_images_registered || 0;
                if (stats.account_address) {
                    userAddress = stats.account_address;
                }
                
                if (stats.connected) {
                    const networkLabel = stats.mode === 'local' ? 'Local ledger' : 'Ethereum';
                    statNetworkStatus.innerHTML = `
                        <span class="status-dot"></span>
                        <span>${networkLabel}</span>
                    `;
                } else {
                    statNetworkStatus.innerHTML = `
                        <span class="status-dot" style="background: var(--error);"></span>
                        <span>Offline</span>
                    `;
                    statNetworkStatus.classList.add('offline');
                }
                
                if (stats.contract_address) {
                    statContractAddress.textContent = stats.contract_address.startsWith('0x')
                        ? Utils.formatAddress(stats.contract_address)
                        : stats.contract_address;
                    statContractAddress.title = `View on Sepolia Etherscan: ${stats.contract_address}`;
                    statContractAddress.style.cursor = 'pointer';
                    statContractAddress.addEventListener('click', () => {
                        if (stats.contract_address.startsWith('0x')) {
                            window.open(`https://sepolia.etherscan.io/address/${stats.contract_address}`, '_blank');
                        } else {
                            Utils.copyToClipboard(stats.contract_address);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    // Load history
    async function loadHistory() {
        try {
            console.log('Loading history...');
            loadingState.style.display = 'flex';
            emptyState.style.display = 'none';
            historyTableBody.innerHTML = '';

            console.log('Calling API.getAllImages...');
            const data = await API.getAllImages(1, 100); // Load first 100 images
            console.log('API response:', data);
            
            if (data.success) {
                allImages = data.images || [];
                
                // Update user images count using logged-in wallet
                const loggedInWallet = (typeof Auth !== 'undefined' && Auth.isLoggedIn()) ? Auth.getWallet() : userAddress;
                if (loggedInWallet && allImages.length > 0) {
                    const userImages = allImages.filter(img => 
                        img.owner && img.owner.toLowerCase() === loggedInWallet.toLowerCase()
                    );
                    statYourImages.textContent = userImages.length;
                } else {
                    statYourImages.textContent = loggedInWallet ? '0' : allImages.length;
                }
                
                if (allImages.length > 0) {
                    applyFilter();
                    loadingState.style.display = 'none';
                } else {
                    loadingState.style.display = 'none';
                    emptyState.style.display = 'flex';
                }
            } else {
                loadingState.style.display = 'none';
                emptyState.style.display = 'flex';
                statYourImages.textContent = '0';
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            loadingState.style.display = 'none';
            emptyState.style.display = 'flex';
            Utils.showToast('Error', 'Failed to load history', 'error');
        }
    }

    // Handle filter
    function handleFilter(filter) {
        currentFilter = filter;
        
        // Update button states
        filterButtons.forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        applyFilter();
    }

    // Apply filter
    function applyFilter() {
        let filtered = [...allImages];
        
        // Apply filter
        if (currentFilter === 'mine' && userAddress) {
            filtered = filtered.filter(img => 
                img.owner.toLowerCase() === userAddress.toLowerCase()
            );
        } else if (currentFilter === 'recent') {
            filtered = filtered.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
        }
        
        // Apply search
        const searchTerm = searchInput.value.toLowerCase().trim();
        if (searchTerm) {
            filtered = filtered.filter(img => 
                img.image_hash.toLowerCase().includes(searchTerm) ||
                img.filename.toLowerCase().includes(searchTerm) ||
                img.owner.toLowerCase().includes(searchTerm)
            );
        }
        
        filteredImages = filtered;
        currentPage = 1;
        renderTable();
    }

    // Handle search
    function handleSearch() {
        applyFilter();
    }

    // Render table
    function renderTable() {
        const start = (currentPage - 1) * perPage;
        const end = start + perPage;
        const pageImages = filteredImages.slice(start, end);
        
        if (pageImages.length === 0) {
            historyTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        No images found
                    </td>
                </tr>
            `;
            pagination.style.display = 'none';
            return;
        }

        const loggedInWallet = (typeof Auth !== 'undefined' && Auth.isLoggedIn()) ? Auth.getWallet().toLowerCase() : '';
        
        historyTableBody.innerHTML = pageImages.map(img => {
            const isOwner = loggedInWallet && img.owner && img.owner.toLowerCase() === loggedInWallet;
            const isRevoked = Boolean(img.isRevoked);
            const canRevoke = isOwner && !isRevoked;

            return `
            <tr class="${isRevoked ? 'revoked-row' : ''}">
                <td>
                    <div class="image-thumbnail">
                        <img src="${(typeof getApiBase === 'function' ? getApiBase() : '')}/api/image/${img.image_hash}" 
                             alt="${img.filename}" 
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
                <td data-label="Registered" class="date-cell">${Utils.formatDate(img.timestamp)}</td>
                <td data-label="IPFS" class="ipfs-cell">
                    ${(img.ipfsCID || img.ipfs_cid) 
                        ? `<a href="${img.ipfsUrl || `https://gateway.pinata.cloud/ipfs/${img.ipfsCID || img.ipfs_cid}`}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-weight: 600;">View</a>` 
                        : '-'}
                </td>
                <td class="actions-cell">
                    <div class="action-buttons">
                        <button class="btn-action" onclick="window.viewDetails('${img.image_hash}')">
                            View
                        </button>
                        <button class="btn-action btn-cert" onclick="window.downloadCertificate('${img.image_hash}')" title="Download Certificate PDF">
                            Certificate
                        </button>
                        <button class="btn-action" onclick="window.copyHash('${img.image_hash}')">
                            Copy
                        </button>
                        ${canRevoke ? `
                        <button class="btn-action btn-transfer" onclick="window.handleTransfer('${img.image_hash}')" style="color: #0071e3; border-color: rgba(0, 113, 227, 0.3);" title="Transfer ownership to another wallet">
                            Transfer
                        </button>
                        <button class="btn-action btn-revoke" onclick="window.handleRevoke('${img.image_hash}')" style="color: #ff3b30; border-color: rgba(255, 59, 48, 0.3);" title="Revoke this registration">
                            Revoke
                        </button>` : ''}
                    </div>
                </td>
            </tr>
            `;
        }).join('');
        
        // Update pagination
        const totalPages = Math.ceil(filteredImages.length / perPage);
        if (totalPages > 1) {
            pagination.style.display = 'flex';
            pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
            prevPageBtn.disabled = currentPage === 1;
            nextPageBtn.disabled = currentPage === totalPages;
        } else {
            pagination.style.display = 'none';
        }
    }

    // Transfer ownership (global function)
    window.handleTransfer = window.transferImage = async function(imageHash) {
        const newOwner = prompt("Enter the new owner's Ethereum wallet address (0x...):");
        if (!newOwner) return;

        const trimmed = newOwner.trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
            Utils.showToast('Invalid Address', 'Must be a valid 42-character Ethereum address starting with 0x', 'error');
            return;
        }

        if (!confirm(`Are you sure you want to permanently transfer ownership of this image to:\n${trimmed}\n\nYou will no longer be able to manage or revoke this asset.`)) {
            return;
        }

        try {
            Utils.showToast('Transferring', 'Submitting transfer transaction to blockchain...', 'info');
            const res = await API.transferImage(imageHash, trimmed);
            if (res.success) {
                Utils.showToast('Transfer Complete!', `Ownership successfully transferred to ${Utils.formatAddress(trimmed)}`, 'success');
                await loadHistory();
            } else {
                Utils.showToast('Transfer Failed', res.error || 'Failed to transfer ownership', 'error');
            }
        } catch (err) {
            Utils.showToast('Error', err.message || 'Failed to transfer ownership', 'error');
        }
    };

    // Revoke registration (global function)
    window.handleRevoke = async function(imageHash) {
        if (!confirm("Are you sure you want to revoke this image? This cannot be undone.")) {
            return;
        }
        try {
            Utils.showToast('Revoking', 'Revoking registration on blockchain...', 'info');
            const res = await API.revokeImage(imageHash);
            if (res.success) {
                Utils.showToast('Revoked!', 'Image registration has been revoked', 'success');
                await loadHistory();
            } else {
                Utils.showToast('Revocation Failed', res.error || 'Failed to revoke image', 'error');
            }
        } catch (err) {
            Utils.showToast('Error', err.message || 'Failed to revoke image', 'error');
        }
    };

    // Change page
    function changePage(page) {
        const totalPages = Math.ceil(filteredImages.length / perPage);
        if (page < 1 || page > totalPages) return;
        
        currentPage = page;
        renderTable();
        
        // Scroll to top of table
        document.querySelector('.history-table').scrollIntoView({ behavior: 'smooth' });
    }

    // View details (global function)
    window.viewDetails = function(imageHash) {
        const image = allImages.find(img => img.image_hash === imageHash);
        if (!image) return;
        
        modalBody.innerHTML = `
            <div class="modal-detail-item">
                <div class="modal-detail-label">Fingerprint (SHA-256)</div>
                <div class="modal-detail-value mono">
                    ${image.image_hash}
                </div>
            </div>
            <div class="modal-detail-item">
                <div class="modal-detail-label">Filename</div>
                <div class="modal-detail-value">${image.filename}</div>
            </div>
            <div class="modal-detail-item">
                <div class="modal-detail-label">Owner Address</div>
                <div class="modal-detail-value mono">
                    ${image.owner && image.owner.startsWith('0x') ? `<a href="https://sepolia.etherscan.io/address/${image.owner}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${image.owner}</a>` : image.owner}
                </div>
            </div>
            ${(image.previousOwner && image.previousOwner !== '0x0000000000000000000000000000000000000000') ? `
            <div class="modal-detail-item">
                <div class="modal-detail-label">Previous Owner</div>
                <div class="modal-detail-value mono">
                    <a href="https://sepolia.etherscan.io/address/${image.previousOwner}" target="_blank" rel="noopener noreferrer" style="color: var(--text-muted); text-decoration: underline;">${image.previousOwner}</a>
                </div>
            </div>` : ''}
            <div class="modal-detail-item">
                <div class="modal-detail-label">Registration Date</div>
                <div class="modal-detail-value">${image.registration_date}</div>
            </div>
            <div class="modal-detail-item">
                <div class="modal-detail-label">Timestamp</div>
                <div class="modal-detail-value">${image.timestamp}</div>
            </div>
            <div class="modal-detail-item">
                <div class="modal-detail-label">IPFS Storage</div>
                <div class="modal-detail-value mono">
                    ${(image.ipfsCID || image.ipfs_cid) 
                        ? `<a href="${image.ipfsUrl || `https://gateway.pinata.cloud/ipfs/${image.ipfsCID || image.ipfs_cid}`}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${image.ipfsCID || image.ipfs_cid}</a>` 
                        : 'Not uploaded'}
                </div>
            </div>
            <div class="modal-detail-item">
                <div class="modal-detail-label">Status</div>
                <div class="modal-detail-value">
                    ${image.isRevoked 
                        ? '<span class="status-badge" style="background: rgba(255, 59, 48, 0.15); color: #ff3b30; font-weight: 600; padding: 4px 10px; border-radius: 6px;">REVOKED</span>' 
                        : '<span class="status-badge verified">Verified on blockchain (Active)</span>'}
                </div>
            </div>
            <div class="modal-detail-item" style="margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--border-color); display: flex; gap: 10px; flex-wrap: wrap;">
                <button type="button" 
                        onclick="window.downloadCertificate('${image.image_hash}')" 
                        class="btn btn-primary" 
                        style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 13px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download Certificate (PDF)
                </button>
                <a href="${(typeof getApiBase === 'function' ? getApiBase() : '')}${image.watermarkedUrl || `/api/image/${image.image_hash}_robust.png`}" 
                   target="_blank" 
                   download="${image.image_hash || 'image'}_robust.png" 
                   class="btn btn-secondary" 
                   style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 13px; text-decoration: none;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download Watermarked Copy
                </a>
            </div>
        `;
        
        detailModal.classList.add('show');
    };

    // Download Certificate (global function)
    window.downloadCertificate = function(imageHash) {
        console.log("Certificate clicked for hash:", imageHash);
        const img = allImages.find(i => i.image_hash === imageHash);
        const isRevoked = img ? Boolean(img.isRevoked) : false;
        const certData = {
            ...(img || { image_hash: imageHash }),
            isVerified: !isRevoked,
            isRevoked: isRevoked
        };
        try {
            if (typeof CertificateGenerator !== 'undefined' && typeof CertificateGenerator.downloadPDF === 'function') {
                CertificateGenerator.downloadPDF(certData);
            } else {
                const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
                window.open(`${apiBase}/api/certificate/${imageHash}`, '_blank');
            }
        } catch (err) {
            console.warn("History cert download error, using backend:", err);
            const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
            window.open(`${apiBase}/api/certificate/${imageHash}`, '_blank');
        }
    };

    // Copy hash (global function)
    window.copyHash = function(hash) {
        Utils.copyToClipboard(hash);
    };

    // Close modal
    function closeModal() {
        detailModal.classList.remove('show');
    }

    // Export to CSV
    function exportToCSV() {
        if (filteredImages.length === 0) {
            Utils.showToast('No Data', 'No images to export', 'warning');
            return;
        }
        
        const headers = ['Image Hash', 'Filename', 'Owner Address', 'Registration Date', 'Timestamp', 'IPFS CID'];
        const rows = filteredImages.map(img => [
            img.image_hash,
            img.filename,
            img.owner,
            img.registration_date,
            img.timestamp,
            img.ipfsCID || img.ipfs_cid || ''
        ]);
        
        let csv = headers.join(',') + '\n';
        csv += rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `blockchain_images_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        Utils.showToast('Exported!', 'Data exported to CSV', 'success');
    }
});
