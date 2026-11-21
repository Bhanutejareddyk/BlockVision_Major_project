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

            const result = await API.verifyImage(selectedFile);
            
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

            const result = await API.verifyHash(hash);
            
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
        if (data.verified && data.authentic) {
            // Image is verified
            verifyResultTitle.textContent = 'Verified & Authentic';
            verifyResultMessage.textContent = 'This image is registered on the blockchain with cryptographic authenticity';
            
            verifyResultIcon.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
            `;
            verifyResultIcon.classList.remove('error');
            verifyResultIcon.classList.add('success');

            const details = [
                { label: 'Status', value: '<span class="status-badge verified">Verified</span>' },
                { label: 'Image Hash (SHA-256)', value: data.image_hash, class: 'hash' },
                { label: 'Owner Address', value: data.owner, class: 'hash' },
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

            if (data.watermark_detected) {
                details.push({
                    label: 'Steganographic Watermark',
                    value: `<span class="status-badge verified" style="font-size:0.75rem;">Embedded: ${data.embedded_watermark || 'tx_hash'}</span>`
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