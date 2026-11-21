// Upload Page JavaScript
// Handles image upload and blockchain registration

// Safe guard: Ensure API_BASE and fallback Utils/API exist without throwing
const API_BASE = (typeof getApiBase === 'function' ? getApiBase() : '');
if (typeof window.Utils === 'undefined') {
    window.Utils = {
        showToast: (title, msg, type = 'info') => {
            console.log(`[Toast ${type}] ${title}: ${msg}`);
            const t = document.getElementById('toast');
            if (t) {
                const tt = t.querySelector('.toast-title');
                const tm = t.querySelector('.toast-message');
                if (tt) tt.textContent = title;
                if (tm) tm.textContent = msg;
                t.classList.add('show');
                setTimeout(() => t.classList.remove('show'), 5000);
            } else {
                alert(`${title}: ${msg}`);
            }
        },
        validateImageFile: (file) => {
            if (!file) return { valid: false, error: 'No file provided' };
            const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp'];
            if (!validTypes.includes(file.type)) return { valid: false, error: 'Invalid file type. Allowed: PNG, JPG, JPEG, GIF, BMP, WEBP' };
            if (file.size > 16 * 1024 * 1024) return { valid: false, error: 'File size exceeds 16MB' };
            return { valid: true };
        },
        formatFileSize: (bytes) => {
            if (!bytes) return '0 B';
            const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
    };
}

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
    const printCertificate = document.getElementById('printCertificate');
    const uploadAnother = document.getElementById('uploadAnother');
    const alertEmailInput = document.getElementById('alertEmailInput');
    const batchModeOption = document.getElementById('batchModeOption');
    const batchFileInput = document.getElementById('batchFileInput');

    let isBatchMode = false;
    let selectedBatchFiles = [];
    let selectedFile = null;
    let uploadedData = null;

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

    if (batchModeOption) {
        batchModeOption.checked = false; // Default batch mode = OFF
        batchModeOption.addEventListener('change', () => {
            isBatchMode = batchModeOption.checked;
            resetUpload();
            const uploadTitle = uploadZone.querySelector('.upload-title');
            const uploadText = uploadZone.querySelector('.upload-text');
            if (isBatchMode) {
                if (uploadTitle) uploadTitle.textContent = 'Drop up to 10 photos here';
                if (uploadText) uploadText.textContent = 'or click to select multiple files';
                if (uploadBtn.querySelector('span')) uploadBtn.querySelector('span').textContent = 'Upload & Register Batch';
            } else {
                if (uploadTitle) uploadTitle.textContent = 'Drop your photo here';
                if (uploadText) uploadText.textContent = 'or click to choose a file';
                if (uploadBtn.querySelector('span')) uploadBtn.querySelector('span').textContent = 'Continue';
            }
        });
    }

    if (batchFileInput) {
        batchFileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files || []);
            if (!files || files.length === 0) {
                alert("Please select at least one image file");
                return;
            }
            handleBatchFilesSelect(files);
        });
    }

    // Click to upload
    uploadZone.addEventListener('click', (e) => {
        if (e.target !== removeImageBtn && !removeImageBtn.contains(e.target)) {
            if (isBatchMode && batchFileInput) {
                batchFileInput.click();
            } else if (fileInput) {
                fileInput.click();
            }
        }
    });

    uploadZone.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === uploadZone) {
            e.preventDefault();
            if (isBatchMode && batchFileInput) {
                batchFileInput.click();
            } else if (fileInput) {
                fileInput.click();
            }
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const file = (e.target.files && e.target.files.length > 0) ? e.target.files[0] : null;
        if (!file) {
            alert("Please select an image first");
            return;
        }
        handleFileSelect(file);
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
        
        const files = Array.from(e.dataTransfer.files || []);
        if (!files || files.length === 0) {
            alert("Please select an image first");
            return;
        }

        if (isBatchMode) {
            handleBatchFilesSelect(files);
        } else {
            handleFileSelect(files[0]);
        }
    });

    // Remove image
    removeImageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetUpload();
    });

    // Upload button
    uploadBtn.addEventListener('click', async (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        console.log("Upload button clicked");

        // Validate selection
        if (isBatchMode) {
            if (!selectedBatchFiles || selectedBatchFiles.length === 0) {
                alert("Please select images for batch upload first");
                return;
            }
            console.log("Batch files selected count:", selectedBatchFiles.length);
        } else {
            if (!selectedFile) {
                alert("Please select an image first");
                return;
            }
            console.log("File selected:", selectedFile.name);
        }

        const token = (typeof Auth !== 'undefined' && Auth.getToken) ? Auth.getToken() : null;
        console.log("Token:", token ? "present" : "MISSING");

        if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
            Utils.showToast('Wallet Required', 'Please connect and sign in with your MetaMask wallet to upload.', 'warning');
            try {
                await Auth.loginWithWallet();
            } catch (err) {
                console.warn('Wallet connection cancelled or failed:', err);
                return;
            }
            if (!Auth.isLoggedIn()) {
                console.warn('User still not logged in after prompt');
                return;
            }
        }

        // Make button ALWAYS responsive: immediately disable and change text
        const originalBtnText = uploadBtn.querySelector('span') ? uploadBtn.querySelector('span').textContent : 'Continue';
        uploadBtn.disabled = true;
        if (uploadBtn.querySelector('span')) {
            uploadBtn.querySelector('span').textContent = 'Uploading...';
        }

        try {
            if (isBatchMode) {
                await handleBatchUploadAndRegister();
            } else {
                await uploadImage();
            }
        } catch (err) {
            console.error('Upload click handler caught error:', err);
            Utils.showToast('Upload Error', err.message || 'An error occurred during upload', 'error');
        } finally {
            // Button must NEVER stay frozen!
            uploadBtn.disabled = false;
            if (uploadBtn.querySelector('span')) {
                uploadBtn.querySelector('span').textContent = originalBtnText;
            }
        }
    });

    // Register button
    registerBtn.addEventListener('click', async (e) => {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        console.log("Register button clicked");
        if (!uploadedData) return;
        
        if (typeof Auth !== 'undefined' && !Auth.isLoggedIn()) {
            Utils.showToast('Wallet Required', 'Please connect your wallet to register on blockchain.', 'warning');
            try {
                await Auth.loginWithWallet();
            } catch (err) {
                console.warn('Wallet login cancelled:', err);
                return;
            }
            if (!Auth.isLoggedIn()) return;
        }

        const originalText = registerBtn.querySelector('span') ? registerBtn.querySelector('span').textContent : 'Save to Blockchain';
        registerBtn.disabled = true;
        if (registerBtn.querySelector('span')) {
            registerBtn.querySelector('span').textContent = 'Registering on Chain...';
        }

        try {
            await registerOnBlockchain();
        } catch (err) {
            console.error('Registration handler error:', err);
            Utils.showToast('Registration Error', err.message || 'Failed to register on blockchain', 'error');
        } finally {
            registerBtn.disabled = false;
            if (registerBtn.querySelector('span')) {
                registerBtn.querySelector('span').textContent = originalText;
            }
        }
    });

    // Download certificate
    if (downloadCertificate) {
        downloadCertificate.addEventListener('click', () => {
            if (uploadedData) {
                generateCertificate();
            }
        });
    }

    // Print certificate
    if (printCertificate) {
        printCertificate.addEventListener('click', () => {
            if (uploadedData && typeof printCertificateA4 === 'function') {
                printCertificateA4(uploadedData);
            }
        });
    }

    // Upload another
    if (uploadAnother) {
        uploadAnother.addEventListener('click', () => {
            resultCard.style.display = 'none';
            resetUpload();
        });
    }

    // Handle single file selection
    function handleFileSelect(file) {
        if (!file) {
            alert("Please select an image first");
            return;
        }

        const validation = Utils.validateImageFile(file);
        if (!validation.valid) {
            Utils.showToast('Invalid File', validation.error, 'error');
            alert(validation.error);
            return;
        }

        selectedFile = file;
        console.log("File selected:", selectedFile.name, "Size:", selectedFile.size);

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            previewImg.style.display = 'block';
            const prevSum = document.getElementById('batchPreviewSummary');
            if (prevSum) prevSum.style.display = 'none';

            uploadContent.style.display = 'none';
            imagePreview.style.display = 'flex';
            uploadBtn.disabled = false;
            if (uploadBtn.querySelector('span')) {
                uploadBtn.querySelector('span').textContent = 'Continue';
            }
        };
        reader.readAsDataURL(file);
    }

    // Handle batch multiple files selection
    function handleBatchFilesSelect(files) {
        if (!files || files.length === 0) {
            alert("Please select images for batch upload first");
            return;
        }

        if (files.length > 10) {
            Utils.showToast('Limit Exceeded', 'Maximum 10 images allowed in batch mode. Taking first 10.', 'warning');
            files = files.slice(0, 10);
        }
        selectedBatchFiles = files;
        uploadContent.style.display = 'none';
        imagePreview.style.display = 'flex';
        previewImg.style.display = 'none';

        let previewSummary = document.getElementById('batchPreviewSummary');
        if (!previewSummary) {
            previewSummary = document.createElement('div');
            previewSummary.id = 'batchPreviewSummary';
            previewSummary.style.textAlign = 'center';
            previewSummary.style.padding = '14px';
            imagePreview.appendChild(previewSummary);
        }
        previewSummary.style.display = 'block';
        previewSummary.innerHTML = `
            <div style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">
                ${files.length} photos selected for batch upload
            </div>
            <div style="font-size: 12px; color: var(--text-muted); max-height: 90px; overflow-y: auto; line-height: 1.4;">
                ${files.map(f => `<span>&bull; ${f.name}</span>`).join('<br>')}
            </div>
        `;

        uploadBtn.disabled = false;
        if (uploadBtn.querySelector('span')) {
            uploadBtn.querySelector('span').textContent = `Upload & Register Batch (${files.length} images)`;
        }
    }

    // Reset upload
    function resetUpload() {
        selectedFile = null;
        selectedBatchFiles = [];
        uploadedData = null;
        fileInput.value = '';
        if (batchFileInput) batchFileInput.value = '';
        previewImg.src = '';
        previewImg.style.display = 'block';
        const prevSum = document.getElementById('batchPreviewSummary');
        if (prevSum) prevSum.style.display = 'none';

        uploadContent.style.display = 'flex';
        imagePreview.style.display = 'none';
        uploadBtn.disabled = false;
        uploadBtn.style.display = 'inline-flex';
        if (uploadBtn.querySelector('span')) {
            uploadBtn.querySelector('span').textContent = isBatchMode ? 'Upload & Register Batch' : 'Continue';
        }
        registerBtn.style.display = 'none';
        progressBar.style.display = 'none';
        if (downloadCertificate) downloadCertificate.style.display = 'inline-flex';
        if (printCertificate) printCertificate.style.display = 'inline-flex';
        const histBtn = document.getElementById('batchViewHistoryBtn');
        if (histBtn) histBtn.remove();
    }

    // Upload single image
    async function uploadImage() {
        console.log("Starting uploadImage for:", selectedFile.name);
        try {
            if (alertEmailInput && alertEmailInput.value.trim()) {
                localStorage.setItem('bv_email', alertEmailInput.value.trim());
            }

            progressBar.style.display = 'block';
            progressFill.style.width = '30%';

            const encrypt = encryptOption ? encryptOption.checked : false;
            const data = await API.uploadImage(selectedFile, encrypt);
            console.log("Upload response received:", data);

            progressFill.style.width = '100%';

            if (data.success) {
                uploadedData = data;
                
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

                setTimeout(() => {
                    progressBar.style.display = 'none';
                    progressFill.style.width = '0%';
                }, 800);
            }
        } catch (error) {
            console.error('uploadImage error:', error);
            Utils.showToast('Upload Failed', error.message, 'error');
            progressBar.style.display = 'none';
            throw error;
        }
    }

    // Register single image on blockchain
    async function registerOnBlockchain() {
        console.log("Starting registerOnBlockchain for hash:", uploadedData.image_hash);
        try {
            progressBar.style.display = 'block';
            progressFill.style.width = '50%';

            const result = await API.registerOnBlockchain(
                uploadedData.image_hash,
                uploadedData.filename
            );
            console.log("Blockchain register response:", result);

            progressFill.style.width = '100%';

            if (result.success) {
                if (result.warning) {
                    Utils.showToast('Re-registered!', result.warning, 'warning');
                } else {
                    Utils.showToast('Registered!', 'Image registered on blockchain', 'success');
                }
                
                const fullData = { ...uploadedData, ...result };
                
                setTimeout(() => {
                    displayResult(fullData);
                    progressBar.style.display = 'none';
                    progressFill.style.width = '0%';
                }, 500);
            }
        } catch (error) {
            console.error('registerOnBlockchain error:', error);
            progressBar.style.display = 'none';
            throw error;
        }
    }

    // Handle batch upload and auto registration
    async function handleBatchUploadAndRegister() {
        console.log("Starting handleBatchUploadAndRegister for files:", selectedBatchFiles.length);
        try {
            if (alertEmailInput && alertEmailInput.value.trim()) {
                localStorage.setItem('bv_email', alertEmailInput.value.trim());
            }

            progressBar.style.display = 'block';
            progressFill.style.width = '20%';

            Utils.showToast('Uploading Batch', `Uploading ${selectedBatchFiles.length} photos and pinning to IPFS...`, 'info');
            const encrypt = encryptOption ? encryptOption.checked : false;

            // 1. Batch Upload
            const upResult = await API.batchUpload(selectedBatchFiles, encrypt);
            progressFill.style.width = '60%';

            if (!upResult.uploaded || upResult.uploaded.length === 0) {
                throw new Error(upResult.failed?.[0]?.error || 'Failed to upload images in batch');
            }

            Utils.showToast('Registering Batch', `Uploaded ${upResult.uploaded.length} images. Registering on Sepolia blockchain...`, 'info');

            // 2. Batch Register
            const regPayload = upResult.uploaded.map(item => ({
                image_hash: item.image_hash,
                filename: item.filename,
                ipfsCID: item.ipfsCID || item.ipfs_cid || ''
            }));

            const regResult = await API.batchRegister(regPayload);
            progressFill.style.width = '100%';

            setTimeout(() => {
                progressBar.style.display = 'none';
                displayBatchResult(upResult, regResult);
            }, 600);

        } catch (error) {
            console.error('Batch upload/register error:', error);
            Utils.showToast('Batch Error', error.message || 'Batch operation failed', 'error');
            progressBar.style.display = 'none';
            throw error;
        }
    }

    // Display single result
    function displayResult(data) {
        resultTitle.textContent = 'Successfully Registered!';
        const ownerAddr = data.owner || (typeof Auth !== 'undefined' ? Auth.getWallet() : '');
        if (ownerAddr) {
            resultMessage.innerHTML = `Registered to your wallet: <a href="https://sepolia.etherscan.io/address/${ownerAddr}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-family: monospace; font-weight: 600; text-decoration: underline;">${ownerAddr.slice(0, 6)}...${ownerAddr.slice(-4)}</a>`;
        } else {
            resultMessage.textContent = 'Your image has been registered on the blockchain';
        }
        
        resultIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        `;
        resultIcon.classList.remove('error');
        resultIcon.classList.add('success');

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
            { label: 'Encrypted', value: data.encrypted ? 'Yes (AES-256)' : 'No' }
        ];

        if (data.ipfsCID) {
            details.push({
                label: 'IPFS Storage',
                value: `<a href="${data.ipfsUrl || `https://gateway.pinata.cloud/ipfs/${data.ipfsCID}`}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-family: monospace; text-decoration: underline;">${data.ipfsCID}</a>`
            });
        }

        if (data.encryption_key) {
            details.push({
                label: 'Decryption Key',
                value: data.encryption_key,
                class: 'hash'
            });
        }

        resultDetails.innerHTML = details.map(detail => `
            <div class="detail-item">
                <span class="detail-label">${detail.label}</span>
                <span class="detail-value ${detail.class || ''}">${detail.value}</span>
            </div>
        `).join('');

        if (downloadCertificate) downloadCertificate.style.display = 'inline-flex';
        if (printCertificate) printCertificate.style.display = 'inline-flex';

        resultCard.style.display = 'block';
        resultCard.scrollIntoView({ behavior: 'smooth' });
    }

    // Display batch results
    function displayBatchResult(upResult, regResult) {
        resultTitle.textContent = 'Batch Registration Complete!';
        const registered = regResult.registered || [];
        const skipped = regResult.skippedDuplicate || [];
        const failed = (regResult.failed || []).concat(upResult.failed || []);

        resultMessage.innerHTML = `Processed ${upResult.total || (registered.length + skipped.length)} photos: <strong style="color: #34c759;">${registered.length} registered on Sepolia</strong>, <strong style="color: #ff9500;">${skipped.length} duplicate(s) skipped</strong>${failed.length > 0 ? `, <strong style="color: #ff3b30;">${failed.length} failed</strong>` : ''}.`;

        resultIcon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
        `;
        resultIcon.classList.remove('error');
        resultIcon.classList.add('success');

        let tableHtml = `
            <div style="margin-top: 14px; overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                            <th style="padding: 8px 10px;">Filename</th>
                            <th style="padding: 8px 10px;">Fingerprint</th>
                            <th style="padding: 8px 10px;">Status</th>
                            <th style="padding: 8px 10px;">IPFS</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        registered.forEach(item => {
            const cid = item.ipfsCID || '';
            tableHtml += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px 10px; font-weight: 600;">${item.filename}</td>
                    <td style="padding: 8px 10px; font-family: monospace;">${item.image_hash.slice(0, 14)}...</td>
                    <td style="padding: 8px 10px;"><span style="background: rgba(52, 199, 89, 0.15); color: #34c759; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">Registered</span></td>
                    <td style="padding: 8px 10px;">${cid ? `<a href="https://gateway.pinata.cloud/ipfs/${cid}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">View</a>` : '-'}</td>
                </tr>
            `;
        });

        skipped.forEach(item => {
            tableHtml += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px 10px; font-weight: 600;">${item.filename}</td>
                    <td style="padding: 8px 10px; font-family: monospace;">${item.image_hash.slice(0, 14)}...</td>
                    <td style="padding: 8px 10px;"><span style="background: rgba(255, 149, 0, 0.15); color: #ff9500; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">Duplicate Skipped</span></td>
                    <td style="padding: 8px 10px; color: var(--text-muted);">-</td>
                </tr>
            `;
        });

        failed.forEach(item => {
            tableHtml += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 8px 10px; font-weight: 600;">${item.filename}</td>
                    <td style="padding: 8px 10px; font-family: monospace;">${(item.image_hash || 'N/A').slice(0, 14)}...</td>
                    <td style="padding: 8px 10px;"><span style="background: rgba(255, 59, 48, 0.15); color: #ff3b30; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;">Failed: ${item.error || 'Error'}</span></td>
                    <td style="padding: 8px 10px; color: var(--text-muted);">-</td>
                </tr>
            `;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        resultDetails.innerHTML = tableHtml;

        if (downloadCertificate) downloadCertificate.style.display = 'none';
        if (printCertificate) printCertificate.style.display = 'none';

        let historyBtn = document.getElementById('batchViewHistoryBtn');
        if (!historyBtn) {
            historyBtn = document.createElement('a');
            historyBtn.id = 'batchViewHistoryBtn';
            historyBtn.href = '/history';
            historyBtn.className = 'btn btn-primary';
            historyBtn.textContent = 'View All in History';
            historyBtn.style.textDecoration = 'none';
            resultCard.querySelector('.result-actions').prepend(historyBtn);
        }

        resultCard.style.display = 'block';
        resultCard.scrollIntoView({ behavior: 'smooth' });
    }

    // Helper to generate certificate from certificate.js
    function generateCertificate() {
        if (!uploadedData) return;
        if (typeof CertificateGenerator !== 'undefined') {
            CertificateGenerator.generateCertificate(uploadedData);
        } else {
            console.error('CertificateGenerator not loaded');
            alert('Certificate generator library not loaded. Please refresh the page.');
        }
    }
});
