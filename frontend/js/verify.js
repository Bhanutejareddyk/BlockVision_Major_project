// Verify Page JavaScript
// Handles image verification and hash checking

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Upload Tab Elements
    const verifyUploadZone = document.getElementById('verifyUploadZone');
    const verifyFileInput = document.getElementById('verifyFileInput');
    const verifyUploadContent = document.getElementById('verifyUploadContent');
    const verifyImagePreview = document.getElementById('verifyImagePreview');
    const verifyPreviewImg = document.getElementById('verifyPreviewImg');
    const verifyRemoveImageBtn = document.getElementById('verifyRemoveImage');
    const verifyBtn = document.getElementById('verifyBtn');
    
    // Hash Tab Elements
    const hashInput = document.getElementById('hashInput');
    const verifyHashBtn = document.getElementById('verifyHashBtn');
    
    // Result Elements
    const verifyProgressBar = document.getElementById('verifyProgressBar');
    const verifyProgressFill = document.getElementById('verifyProgressFill');
    const verifyResultCard = document.getElementById('verifyResultCard');
    const verifyResultIcon = document.getElementById('verifyResultIcon');
    const verifyResultTitle = document.getElementById('verifyResultTitle');
    const verifyResultMessage = document.getElementById('verifyResultMessage');
    const verifyResultDetails = document.getElementById('verifyResultDetails');
    const verifyAnother = document.getElementById('verifyAnother');

    let selectedFile = null;
    let currentTab = 'upload';
    let lastVerificationResult = null;

    const downloadVerifyCertBtn = document.getElementById('downloadVerifyCertificate');
    const printVerifyCertBtn = document.getElementById('printVerifyCertificate');
    const downloadCertBtnText = document.getElementById('downloadCertBtnText');
    const notifyOwnerCheckbox = document.getElementById('notifyOwnerCheckbox');
    const verifyEmailBox = document.getElementById('verifyEmailBox');
    const verifyEmailInput = document.getElementById('verifyEmailInput');

    if (notifyOwnerCheckbox) {
        if (verifyEmailInput) {
            verifyEmailInput.value = localStorage.getItem('bv_email') || '';
        }
        notifyOwnerCheckbox.addEventListener('change', () => {
            if (verifyEmailBox) {
                verifyEmailBox.style.display = notifyOwnerCheckbox.checked ? 'block' : 'none';
            }
        });
    }

    function getNotifyEmail() {
        if (!notifyOwnerCheckbox || !notifyOwnerCheckbox.checked) return null;
        const val = verifyEmailInput ? verifyEmailInput.value.trim() : '';
        return val || localStorage.getItem('bv_email') || null;
    }

    // Tab switching
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            switchTab(targetTab);
        });
    });

    function switchTab(tabName) {
        currentTab = tabName;
        
        tabButtons.forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        tabContents.forEach(content => {
            if (content.id === `${tabName}Tab`) {
                content.classList.add('active');
            } else {
                content.classList.remove('active');
            }
        });
        
        resetVerification();
    }

    // Auto-detect QR code verification link: ?hash=0x... or 64-char hex
    const urlParams = new URLSearchParams(window.location.search);
    const hashParam = urlParams.get('hash');
    if (hashParam) {
        const cleanHash = hashParam.trim();
        if (cleanHash.length === 64) {
            switchTab('hash');
            hashInput.value = cleanHash;
            verifyHashBtn.disabled = false;
            verifyByHash(cleanHash);
        }
    }

    // Upload Tab - Click to upload
    verifyUploadZone.addEventListener('click', (e) => {
        if (e.target !== verifyRemoveImageBtn && !verifyRemoveImageBtn.contains(e.target)) {
            verifyFileInput.click();
        }
    });

    verifyUploadZone.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === verifyUploadZone) {
            e.preventDefault();
            verifyFileInput.click();
        }
    });

    // File input change
    verifyFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileSelect(file);
        }
    });

    // Drag and drop
    verifyUploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        verifyUploadZone.classList.add('dragover');
    });

    verifyUploadZone.addEventListener('dragleave', () => {
        verifyUploadZone.classList.remove('dragover');
    });

    verifyUploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        verifyUploadZone.classList.remove('dragover');
        
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    });

    // Remove image
    verifyRemoveImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUpload();
    });

    // Hash input validation
    hashInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        verifyHashBtn.disabled = value.length !== 64;
    });

    // Verify button (upload tab)
    verifyBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        await verifyImage();
    });

    // Verify button (hash tab)
    verifyHashBtn.addEventListener('click', async () => {
        const hash = hashInput.value.trim();
        if (hash.length === 64) {
            await verifyByHash(hash);
        }
    });

    // Verify another button
    verifyAnother.addEventListener('click', () => {
        verifyResultCard.style.display = 'none';
        resetVerification();
    });

    // Handle file selection
    function handleFileSelect(file) {
        const validation = Utils.validateImageFile(file);
        
        if (!validation.valid) {
            Utils.showToast('Invalid File', validation.error, 'error');
            return;
        }

        selectedFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            verifyPreviewImg.src = e.target.result;
            verifyUploadContent.style.display = 'none';
            verifyImagePreview.style.display = 'flex';
            verifyBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    // Reset upload
    function resetUpload() {
        selectedFile = null;
        verifyFileInput.value = '';
        verifyPreviewImg.src = '';
        verifyUploadContent.style.display = 'flex';
        verifyImagePreview.style.display = 'none';
        verifyBtn.disabled = true;
    }

    // Reset verification
    function resetVerification() {
        if (currentTab === 'upload') {
            resetUpload();
        } else {
            hashInput.value = '';
            verifyHashBtn.disabled = true;
        }
        verifyProgressBar.style.display = 'none';
        verifyResultCard.style.display = 'none';
        if (downloadVerifyCertBtn) downloadVerifyCertBtn.style.display = 'none';
        if (printVerifyCertBtn) printVerifyCertBtn.style.display = 'none';
        lastVerificationResult = null;
    }

    // Verify image
    async function verifyImage() {
        try {
            verifyBtn.disabled = true;
            verifyProgressBar.style.display = 'block';
            verifyProgressFill.style.width = '50%';

            const notifyEmail = getNotifyEmail();
            const result = await API.verifyImage(selectedFile, notifyEmail);
            
            verifyProgressFill.style.width = '100%';

            setTimeout(() => {
                displayResult(result);
                verifyProgressBar.style.display = 'none';
                verifyProgressFill.style.width = '0%';
            }, 400);

        } catch (error) {
            Utils.showToast('Verification Failed', error.message, 'error');
            verifyBtn.disabled = false;
            verifyProgressBar.style.display = 'none';
        }
    }

    // Verify by hash
    async function verifyByHash(hash) {
        try {
            verifyHashBtn.disabled = true;
            verifyProgressBar.style.display = 'block';
            verifyProgressFill.style.width = '50%';

            const notifyEmail = getNotifyEmail();
            const result = await API.verifyHash(hash, notifyEmail);
            
            verifyProgressFill.style.width = '100%';

            setTimeout(() => {
                displayResult(result);
                verifyProgressBar.style.display = 'none';
                verifyProgressFill.style.width = '0%';
            }, 400);

        } catch (error) {
            Utils.showToast('Verification Failed', error.message, 'error');
            verifyHashBtn.disabled = false;
            verifyProgressBar.style.display = 'none';
        }
    }

    // Display result
    function displayResult(data) {
        const isRevoked = data.status === 'REVOKED' || Boolean(data.isRevoked);
        const isSimilar = data.status === 'SIMILAR - POSSIBLE TAMPERED COPY' || 
                          data.status === 'SIMILAR' || 
                          (Boolean(data.tampered) && (data.visual_similarity_percent >= 85 || data.similarity_score >= 85));

        if (isRevoked) {
            // Image is REVOKED
            verifyResultTitle.textContent = 'Registration Revoked';
            verifyResultMessage.innerHTML = '<span style="color: #ff3b30; font-weight: 700; font-size: 15px;">REVOKED - This registration was revoked by owner.</span>';

            verifyResultIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="#ff3b30" width="32" height="32">
                    <circle cx="12" cy="12" r="10" stroke-width="2"/>
                    <line x1="15" y1="9" x2="9" y2="15" stroke-width="2"/>
                    <line x1="9" y1="9" x2="15" y2="15" stroke-width="2"/>
                </svg>
            `;
            verifyResultIcon.classList.remove('success');
            verifyResultIcon.classList.add('error');

            const details = [
                { 
                    label: 'Status', 
                    value: '<span class="status-badge" style="background: rgba(255, 59, 48, 0.15); color: #ff3b30; font-weight: 700; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255, 59, 48, 0.4);">REVOKED BY OWNER</span>' 
                },
                { 
                    label: 'Warning', 
                    value: '<span style="color: #ff3b30; font-weight: 600;">This registration was officially cancelled. Any certificate generated for this hash is null and void.</span>' 
                },
                { label: 'Image Hash (SHA-256)', value: data.image_hash, class: 'hash' },
                { 
                    label: 'Registered Owner', 
                    value: data.owner && data.owner.startsWith('0x') 
                        ? `<a href="https://sepolia.etherscan.io/address/${data.owner}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${data.owner}</a>` 
                        : (data.owner || 'N/A'), 
                    class: 'hash' 
                },
                { label: 'Original Filename', value: data.original_filename || 'Unknown' },
                { label: 'Registration Date', value: data.timestamp ? Utils.formatDate(data.timestamp) : (data.registration_date || 'N/A') }
            ];

            const ipfsCid = data.ipfsCID || data.ipfs_cid;
            if (ipfsCid) {
                const ipfsUrl = data.ipfsUrl || `https://gateway.pinata.cloud/ipfs/${ipfsCid}`;
                details.push({
                    label: 'IPFS Storage',
                    value: `<a href="${ipfsUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-family: monospace;">${ipfsCid}</a>`
                });
            }

            verifyResultDetails.innerHTML = details.map(detail => `
                <div class="detail-item">
                    <span class="detail-label">${detail.label}</span>
                    <span class="detail-value ${detail.class || ''}">${detail.value}</span>
                </div>
            `).join('');

        } else if (isSimilar) {
            // Upgrade #6: SIMILAR / POSSIBLE TAMPERED COPY
            verifyResultTitle.textContent = 'Possible Tampered Copy Detected';
            const simPct = data.similarity || (data.visual_similarity_percent ? `${data.visual_similarity_percent}%` : '85%+');
            const origHash = data.original_hash || 'N/A';

            verifyResultMessage.innerHTML = `
                <div style="background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; border-radius: 8px; padding: 12px 16px; margin: 8px 0; color: #854d0e; text-align: left;">
                    <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">
                        âš  Warning: Image looks ${simPct} similar to registered image - May be cropped / compressed / tampered.
                    </div>
                    <div style="font-size: 12.5px; word-break: break-all;">
                        Original hash: <span style="font-family: monospace; font-weight: 600;">${origHash}</span>
                    </div>
                </div>
            `;

            verifyResultIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="#eab308" width="32" height="32">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke-width="2"/>
                    <line x1="12" y1="9" x2="12" y2="13" stroke-width="2"/>
                    <line x1="12" y1="17" x2="12.01" y2="17" stroke-width="2"/>
                </svg>
            `;
            verifyResultIcon.classList.remove('success', 'error');

            const details = [
                { 
                    label: 'Status', 
                    value: `<span class="status-badge" style="background: rgba(234, 179, 8, 0.2); color: #ca8a04; border: 1px solid #eab308; font-weight: 700;">SIMILAR (${simPct})</span>` 
                },
                { label: 'Visual Similarity', value: `<strong style="color: #ca8a04;">${simPct}</strong>` },
                { label: 'Original Hash (Registered)', value: origHash, class: 'hash' },
                { 
                    label: 'Original Registered Owner', 
                    value: (data.original_owner && data.original_owner.startsWith('0x'))
                        ? `<a href="https://sepolia.etherscan.io/address/${data.original_owner}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${data.original_owner}</a>` 
                        : (data.original_owner || 'Registered User'),
                    class: 'hash'
                },
                { label: 'Uploaded File Hash (SHA-256)', value: data.image_hash, class: 'hash' },
                { 
                    label: 'Watermark', 
                    value: data.watermark_detected 
                        ? '<span class="status-badge verified" style="font-size:0.75rem;">Present</span>' 
                        : '<span style="color: var(--text-muted);">Not Detected</span>' 
                }
            ];

            if (data.uploaded_filename) {
                details.push({ label: 'Uploaded Filename', value: data.uploaded_filename });
            }

            const heatmapUrl = data.diff_heatmap_url || data.heatmap_url;
            let heatmapHtml = '';
            if (heatmapUrl) {
                const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
                heatmapHtml = `
                    <div style="margin-top: 18px; padding: 14px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; background: var(--card-bg, #f8fafc); text-align: center;">
                        <h4 style="margin: 0 0 6px 0; font-size: 14px; color: var(--text-primary, #0f172a);">Visual Tamper Difference Heatmap</h4>
                        <p style="font-size: 12px; color: #dc2626; font-weight: 600; margin: 0 0 10px 0;">Red areas = Changed pixels</p>
                        <img src="${apiBase}${heatmapUrl}" 
                             alt="Tamper Difference Heatmap" 
                             style="max-width: 100%; max-height: 280px; object-fit: contain; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff;">
                    </div>
                `;
            }

            verifyResultDetails.innerHTML = details.map(detail => `
                <div class="detail-item">
                    <span class="detail-label">${detail.label}</span>
                    <span class="detail-value ${detail.class || ''}">${detail.value}</span>
                </div>
            `).join('') + heatmapHtml;

        } else if (data.verified && data.authentic) {
            // Image is verified
            verifyResultTitle.textContent = 'Verified & Authentic';
            verifyResultMessage.innerHTML = `
                <div style="background: rgba(34, 197, 94, 0.12); border: 1px solid #22c55e; border-radius: 8px; padding: 10px 14px; margin: 8px 0; color: #15803d; font-weight: 600; font-size: 13.5px;">
                    âœ“ 100% Cryptographic Match - Image verified and authentic on blockchain
                </div>
            `;
            
            verifyResultIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
            `;
            verifyResultIcon.classList.remove('error');
            verifyResultIcon.classList.add('success');

            const details = [
                { label: 'Status', value: '<span class="status-badge verified">Verified (100% Match)</span>' },
                { 
                    label: 'Watermark', 
                    value: data.watermark_detected 
                        ? '<span class="status-badge verified" style="font-size:0.75rem;">Present</span>' 
                        : '<span style="color: var(--text-muted);">Not Detected</span>' 
                },
                { label: 'Image Hash (SHA-256)', value: data.image_hash, class: 'hash' },
                { 
                    label: 'Owner Address', 
                    value: data.owner && data.owner.startsWith('0x') 
                        ? `<a href="https://sepolia.etherscan.io/address/${data.owner}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${data.owner}</a>` 
                        : data.owner, 
                    class: 'hash' 
                },
                { label: 'Registration Date', value: data.timestamp ? Utils.formatDate(data.timestamp) : data.registration_date },
                { label: 'Original Filename', value: data.original_filename }
            ];

            if (data.perceptual_hash) {
                details.push({
                    label: 'Perceptual Hash (dHash)',
                    value: data.perceptual_hash,
                    class: 'hash'
                });
            }

            if (data.watermark_detected && data.embedded_watermark) {
                details.push({
                    label: 'Embedded Watermark',
                    value: `<span class="status-badge verified" style="font-size:0.75rem;">${data.embedded_watermark}</span>`
                });
            }

            if (data.uploaded_filename) {
                details.push({ 
                    label: 'Uploaded As', 
                    value: data.uploaded_filename 
                });
            }

            if (data.dimensions) {
                details.push({ label: 'Dimensions', value: data.dimensions });
            }

            if (data.format) {
                details.push({ label: 'Format', value: data.format });
            }

            const ipfsCid = data.ipfsCID || data.ipfs_cid;
            if (ipfsCid) {
                const ipfsUrl = data.ipfsUrl || `https://gateway.pinata.cloud/ipfs/${ipfsCid}`;
                details.push({
                    label: 'IPFS Storage',
                    value: `<a href="${ipfsUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-family: monospace;">${ipfsCid}</a>`
                });
            }

            verifyResultDetails.innerHTML = details.map(detail => `
                <div class="detail-item">
                    <span class="detail-label">${detail.label}</span>
                    <span class="detail-value ${detail.class || ''}">${detail.value}</span>
                </div>
            `).join('');

        } else {
            // Image not verified
            verifyResultTitle.textContent = 'Not Verified';
            verifyResultMessage.textContent = 'This image was not found on the blockchain';
            
            verifyResultIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
            `;
            verifyResultIcon.classList.remove('success');
            verifyResultIcon.classList.add('error');

            const details = [
                { label: 'Status', value: '<span class="status-badge not-verified">Not Verified</span>' },
                { label: 'Image Hash (SHA-256)', value: data.image_hash, class: 'hash' },
                { label: 'Message', value: data.message || 'Image not found in blockchain records' }
            ];

            if (data.perceptual_hash) {
                details.push({
                    label: 'Perceptual Hash (dHash)',
                    value: data.perceptual_hash,
                    class: 'hash'
                });
            }

            if (data.uploaded_filename) {
                details.push({ 
                    label: 'Filename', 
                    value: data.uploaded_filename 
                });
            }

            verifyResultDetails.innerHTML = details.map(detail => `
                <div class="detail-item">
                    <span class="detail-label">${detail.label}</span>
                    <span class="detail-value ${detail.class || ''}">${detail.value}</span>
                </div>
            `).join('') + `
                <div class="detail-item">
                    <p class="detail-note">
                        <strong>Tip:</strong> If this is your photo, register it on the Upload page to secure proof of authenticity and ownership.
                    </p>
                </div>
            `;
        }

        // Add click to copy on hash values
        verifyResultDetails.querySelectorAll('.hash').forEach(el => {
            el.style.cursor = 'pointer';
            el.title = 'Click to copy';
            el.addEventListener('click', () => {
                Utils.copyToClipboard(el.textContent);
            });
        });

        // Store verification result and show certificate buttons
        lastVerificationResult = data;
        const isAuthentic = !!(data.verified && data.authentic);

        if (isRevoked) {
            // Do NOT show verified certificate buttons for revoked images
            if (downloadVerifyCertBtn) downloadVerifyCertBtn.style.display = 'none';
            if (printVerifyCertBtn) printVerifyCertBtn.style.display = 'none';
        } else {
            if (downloadVerifyCertBtn) {
                downloadVerifyCertBtn.style.display = 'inline-flex';
                if (downloadCertBtnText) {
                    downloadCertBtnText.textContent = isAuthentic 
                        ? 'Download Certificate (PDF)' 
                        : 'Download Audit Report (PDF)';
                }
            }
            if (printVerifyCertBtn) {
                printVerifyCertBtn.style.display = 'inline-flex';
            }
        }

        const btnViewIpfs = document.getElementById('btnViewIpfs');
        if (btnViewIpfs) {
            const ipfsCid = data.ipfsCID || data.ipfs_cid;
            if (ipfsCid) {
                const ipfsUrl = data.ipfsUrl || `https://gateway.pinata.cloud/ipfs/${ipfsCid}`;
                btnViewIpfs.href = ipfsUrl;
                btnViewIpfs.style.display = 'inline-flex';
            } else {
                btnViewIpfs.style.display = 'none';
            }
        }

        verifyResultCard.style.display = 'block';
        verifyResultCard.scrollIntoView({ behavior: 'smooth' });
    }

    // Certificate download & print event listeners
    if (downloadVerifyCertBtn) {
        downloadVerifyCertBtn.addEventListener('click', () => {
            if (lastVerificationResult && typeof CertificateGenerator !== 'undefined') {
                CertificateGenerator.downloadPDF({
                    ...lastVerificationResult,
                    isVerified: !!(lastVerificationResult.verified && lastVerificationResult.authentic)
                });
            }
        });
    }

    if (printVerifyCertBtn) {
        printVerifyCertBtn.addEventListener('click', () => {
            if (lastVerificationResult && typeof CertificateGenerator !== 'undefined') {
                CertificateGenerator.print({
                    ...lastVerificationResult,
                    isVerified: !!(lastVerificationResult.verified && lastVerificationResult.authentic)
                });
            }
        });
    }
});