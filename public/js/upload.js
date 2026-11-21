// Upload Page JavaScript
// Handles image upload and blockchain registration

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const uploadContent = document.getElementById('uploadContent');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImg');
    const removeImageBtn = document.getElementById('removeImage');
    const encryptOption = document.getElementById('encryptOption');
    const uploadBtn = document.getElementById('uploadBtn');
    const registerBtn = document.getElementById('registerBtn');
    const progressBar = document.getElementById('progressBar');
    const progressFill = document.getElementById('progressFill');
    const resultCard = document.getElementById('resultCard');
    const resultIcon = document.getElementById('resultIcon');
    const resultTitle = document.getElementById('resultTitle');
    const resultMessage = document.getElementById('resultMessage');
    const resultDetails = document.getElementById('resultDetails');
    const downloadCertificate = document.getElementById('downloadCertificate');
    const uploadAnother = document.getElementById('uploadAnother');
    const alertEmailInput = document.getElementById('alertEmailInput');

    if (alertEmailInput) {
        alertEmailInput.value = localStorage.getItem('bv_email') || '';
        alertEmailInput.addEventListener('input', () => {
            const val = alertEmailInput.value.trim();
            if (val) {
                localStorage.setItem('bv_email', val);
            } else {
                localStorage.removeItem('bv_email');
            }
        });
    }

    let selectedFile = null;
    let uploadedData = null;

    // Click to upload
    uploadZone.addEventListener('click', (e) => {
        if (e.target !== removeImageBtn && !removeImageBtn.contains(e.target)) {
            fileInput.click();
        }
    });

    uploadZone.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === uploadZone) {
            e.preventDefault();
            fileInput.click();
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileSelect(file);
        }
    });

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    });

    // Remove image
    removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUpload();
    });

    // Upload button
    uploadBtn.addEventListener('click', async () => {
        if (!selectedFile) return;
        
        if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
            Utils.showToast('Wallet Required', 'Please connect and sign in with your MetaMask wallet to upload.', 'warning');
            try {
                await Auth.loginWithWallet();
            } catch (err) {
                return;
            }
        }

        await uploadImage();
    });

    // Register button
    registerBtn.addEventListener('click', async () => {
        if (!uploadedData) return;
        
        if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
            Utils.showToast('Wallet Required', 'Please connect your wallet to register on blockchain.', 'warning');
            try {
                await Auth.loginWithWallet();
            } catch (err) {
                return;
            }
        }

        await registerOnBlockchain();
    });

    // Download certificate
    downloadCertificate.addEventListener('click', () => {
        if (uploadedData) {
            generateCertificate();
        }
    });

    // Upload another
    uploadAnother.addEventListener('click', () => {
        resultCard.style.display = 'none';
        resetUpload();
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
            previewImg.src = e.target.result;
            uploadContent.style.display = 'none';
            imagePreview.style.display = 'flex';
            uploadBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }

    // Reset upload
    function resetUpload() {
        selectedFile = null;
        uploadedData = null;
        fileInput.value = '';
        previewImg.src = '';
        uploadContent.style.display = 'flex';
        imagePreview.style.display = 'none';
        uploadBtn.disabled = true;
        uploadBtn.style.display = 'inline-flex';
        registerBtn.style.display = 'none';
        progressBar.style.display = 'none';
        if (downloadCertificate) downloadCertificate.style.display = 'inline-flex';
    }

    // Upload image
    async function uploadImage() {
        try {
            if (alertEmailInput && alertEmailInput.value.trim()) {
                localStorage.setItem('bv_email', alertEmailInput.value.trim());
            }

            uploadBtn.disabled = true;
            progressBar.style.display = 'block';
            progressFill.style.width = '30%';

            const encrypt = encryptOption.checked;
            const data = await API.uploadImage(selectedFile, encrypt);

            progressFill.style.width = '100%';

            if (data.success) {
                uploadedData = data;
                
                // Check if near-duplicate warning exists
                if (data.near_duplicate || data.warning) {
                    const topMatch = data.near_duplicate || {};
                    const sim = topMatch.similarity || '95%';
                    const owner = topMatch.existingOwner || 'Unknown';
                    const shortOwner = (owner && owner.startsWith('0x')) ? `${owner.slice(0, 6)}...${owner.slice(-4)}` : owner;
                    Utils.showToast(
                        'Near-Duplicate Warning', 
                        `Warning: Very similar image already registered (${sim} similar) - Owner: ${shortOwner}`, 
                        'warning'
                    );
                } else {
                    Utils.showToast('Success!', 'Image uploaded and hash generated', 'success');
                }
                
                // Show register button
                uploadBtn.style.display = 'none';
                registerBtn.style.display = 'flex';
                registerBtn.disabled = false;

                // Update UI with hash info
                setTimeout(() => {
                    progressBar.style.display = 'none';
                    progressFill.style.width = '0%';
                }, 1000);
            }
        } catch (error) {
            Utils.showToast('Upload Failed', error.message, 'error');
            uploadBtn.disabled = false;
            progressBar.style.display = 'none';
        }
    }

    // Register on blockchain
    async function registerOnBlockchain() {
        try {
            registerBtn.disabled = true;
            progressBar.style.display = 'block';
            progressFill.style.width = '50%';

            const result = await API.registerOnBlockchain(
                uploadedData.image_hash,
                uploadedData.filename
            );

            progressFill.style.width = '100%';

            if (result.success) {
                if (result.warning) {
                    Utils.showToast('Re-registered!', result.warning, 'warning');
                } else {
                    Utils.showToast('Registered!', 'Image registered on blockchain', 'success');
                }
                
                // Combine data
                const fullData = { ...uploadedData, ...result };
                
                // Show result card
                setTimeout(() => {
                    displayResult(fullData);
                    progressBar.style.display = 'none';
                    progressFill.style.width = '0%';
                }, 1000);
            }
        } catch (error) {
            // Check for 409 already registered error
            if (error.status === 409 || (error.data && error.data.error === 'Image already registered')) {
                const dupData = error.data || {};
                const owner = dupData.owner || 'Unknown';
                const shortOwner = (owner && owner.startsWith('0x')) ? `${owner.slice(0, 6)}...${owner.slice(-4)}` : owner;
                Utils.showToast('Registration Blocked', `Image already registered on blockchain! Owner: ${shortOwner}`, 'error');
                displayDuplicateCard({ ...uploadedData, ...dupData });
            } else {
                Utils.showToast('Registration Failed', error.message, 'error');
            }
            registerBtn.disabled = false;
            progressBar.style.display = 'none';
        }
    }

    // Display duplicate card if already registered (409)
    function displayDuplicateCard(data) {
        resultTitle.textContent = 'Image Already Registered';
        const ownerAddr = data.owner || 'Unknown';
        resultMessage.innerHTML = `This exact image hash already exists on the blockchain and is active.<br>Registered by: <a href="https://sepolia.etherscan.io/address/${ownerAddr}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-family: monospace; font-weight: 600; text-decoration: underline;">${ownerAddr}</a>`;

        resultIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
        `;
        resultIcon.classList.remove('success');
        resultIcon.classList.add('error');

        const details = [
            { label: 'Image Hash', value: data.image_hash, class: 'hash' },
            { 
                label: 'Registered Owner', 
                value: `<a href="https://sepolia.etherscan.io/address/${ownerAddr}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-family: monospace;">${ownerAddr}</a>` 
            },
            { label: 'Status', value: '<span style="color: var(--error); font-weight: 600;">Active on Blockchain</span>' }
        ];

        if (data.timestamp) {
            details.push({ label: 'Registered On', value: new Date(data.timestamp * 1000).toLocaleString() });
        }
        if (data.ipfsCID) {
            details.push({
                label: 'IPFS',
                value: `<a href="https://gateway.pinata.cloud/ipfs/${data.ipfsCID}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-family: monospace;">${data.ipfsCID}</a>`
            });
        }

        resultDetails.innerHTML = details.map(detail => `
            <div class="detail-item">
                <span class="detail-label">${detail.label}</span>
                <span class="detail-value ${detail.class || ''}">
                    ${detail.value}
                </span>
            </div>
        `).join('');

        downloadCertificate.style.display = 'none';
        resultCard.style.display = 'block';
        resultCard.scrollIntoView({ behavior: 'smooth' });
    }

    // Display result
    function displayResult(data) {
        resultTitle.textContent = 'Successfully Registered!';
        const ownerAddr = data.owner || (typeof Auth !== 'undefined' ? Auth.getWallet() : '');
        if (ownerAddr) {
            resultMessage.innerHTML = `Registered to your wallet: <a href="https://sepolia.etherscan.io/address/${ownerAddr}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-family: monospace; font-weight: 600; text-decoration: underline;">${ownerAddr.slice(0, 6)}...${ownerAddr.slice(-4)}</a>`;
        } else {
            resultMessage.textContent = 'Your image has been registered on the blockchain';
        }
        
        // Update icon
        resultIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        `;
        resultIcon.classList.remove('error');
        resultIcon.classList.add('success');

        // Build details
        const details = [
            { label: 'Image Hash', value: data.image_hash, class: 'hash' },
            { label: 'Filename', value: data.filename },
            { 
                label: 'Registered Owner', 
                value: ownerAddr 
                    ? `<a href="https://sepolia.etherscan.io/address/${ownerAddr}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-family: monospace;">${ownerAddr}</a>` 
                    : 'N/A'
            },
            { label: 'File Size', value: Utils.formatFileSize(data.file_size) },
            { label: 'Dimensions', value: data.dimensions },
            { label: 'Format', value: data.format },
            { 
                label: 'Transaction Hash', 
                value: data.transaction_hash && data.transaction_hash.startsWith('0x')
                    ? `<a href="https://sepolia.etherscan.io/tx/${data.transaction_hash}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">${data.transaction_hash}</a>`
                    : (data.transaction_hash || 'N/A'), 
                class: 'hash' 
            },
            { label: 'Block Number', value: data.block_number },
            { label: 'Gas Used', value: data.gas_used },
            { label: 'Timestamp', value: new Date(data.timestamp).toLocaleString() }
        ].filter(detail => !(detail.label === 'Gas Used' && !detail.value));

        // IPFS CID detail line
        const ipfsCid = data.ipfsCID || data.ipfs_cid;
        if (ipfsCid) {
            const ipfsUrl = data.ipfsUrl || `https://gateway.pinata.cloud/ipfs/${ipfsCid}`;
            details.push({
                label: 'IPFS',
                value: `<span style="display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <a href="${ipfsUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline; font-family: monospace;">${ipfsCid}</a>
                    <button type="button" onclick="Utils.copyToClipboard('${ipfsCid}')" style="background: var(--bg-secondary); border: 1px solid var(--border-color); padding: 2px 8px; font-size: 0.75rem; border-radius: 4px; cursor: pointer;">Copy</button>
                </span>`
            });
        } else {
            details.push({
                label: 'IPFS',
                value: '<span style="color: var(--text-muted); font-style: italic;">Not uploaded</span>'
            });
        }

        if (data.encrypted) {
            details.push({ 
                label: 'Encryption', 
                value: 'AES-256 Enabled âœ“',
                style: 'color: var(--success);'
            });
        }

        resultDetails.innerHTML = details.map(detail => `
            <div class="detail-item">
                <span class="detail-label">${detail.label}</span>
                <span class="detail-value ${detail.class || ''}" ${detail.style ? `style="${detail.style}"` : ''}>
                    ${detail.value}
                </span>
            </div>
        `).join('');

        // Add click to copy on hash values
        resultDetails.querySelectorAll('.hash').forEach(el => {
            el.style.cursor = 'pointer';
            el.title = 'Click to copy';
            el.addEventListener('click', () => {
                Utils.copyToClipboard(el.textContent);
            });
        });

        // Upgrade #6: Display watermarked copy section
        const watermarkedUrl = data.watermarkedUrl || `/api/image/${data.image_hash}_robust.png`;
        const existingWmSection = document.getElementById('watermarkedSection');
        if (existingWmSection) existingWmSection.remove();

        const wmSection = document.createElement('div');
        wmSection.id = 'watermarkedSection';
        wmSection.style.cssText = 'margin-top: 20px; padding: 16px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: var(--card-bg, #f8fafc);';
        const apiBase = (typeof getApiBase === 'function') ? getApiBase() : '';
        wmSection.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: var(--text-primary); font-size: 15px; font-weight: 600;">Watermarked Copy:</h4>
            <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                <img src="${apiBase}${watermarkedUrl}" 
                     alt="Watermarked Preview" 
                     style="width: 88px; height: 88px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); background: #ffffff;"
                     onerror="this.style.display='none'">
                <div style="flex: 1; min-width: 220px;">
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: var(--text-secondary, #475569);">
                        This copy has visible BlockVision watermark. Original without watermark is on IPFS.
                    </p>
                    <a href="${apiBase}${watermarkedUrl}" 
                       download="${data.image_hash || 'image'}_robust.png" 
                       target="_blank" 
                       class="btn btn-secondary" 
                       style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; font-size: 13px; text-decoration: none;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download Watermarked Copy (.png)
                    </a>
                </div>
            </div>
        `;
        resultDetails.parentNode.insertBefore(wmSection, resultDetails.nextSibling);

        resultCard.style.display = 'block';
        resultCard.scrollIntoView({ behavior: 'smooth' });
    }

    // Generate certificate
    function generateCertificate() {
        if (!uploadedData) {
            Utils.showToast('Error', 'No data available for certificate', 'error');
            return;
        }
        if (typeof CertificateGenerator !== 'undefined') {
            const owner = uploadedData.owner || (typeof Auth !== 'undefined' ? Auth.getWallet() : '');
            CertificateGenerator.downloadPDF({ ...uploadedData, owner, isVerified: true });
        } else {
            Utils.showToast('Error', 'CertificateGenerator not loaded', 'error');
        }
    }
});
