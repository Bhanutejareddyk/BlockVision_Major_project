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

    let selectedFile = null;
    let uploadedData = null;

    // Click to upload
    uploadZone.addEventListener('click', (e) => {
        if (e.target !== removeImageBtn && !removeImageBtn.contains(e.target)) {
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
        
        await uploadImage();
    });

    // Register button
    registerBtn.addEventListener('click', async () => {
        if (!uploadedData) return;
        
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
        registerBtn.style.display = 'none';
        progressBar.style.display = 'none';
    }

    // Upload image
    async function uploadImage() {
        try {
            uploadBtn.disabled = true;
            progressBar.style.display = 'block';
            progressFill.style.width = '30%';

            const encrypt = encryptOption.checked;
            const data = await API.uploadImage(selectedFile, encrypt);

            progressFill.style.width = '100%';

            if (data.success) {
                uploadedData = data;
                Utils.showToast('Success!', 'Image uploaded and hash generated', 'success');
                
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
                Utils.showToast('Registered!', 'Image registered on blockchain', 'success');
                
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
            Utils.showToast('Registration Failed', error.message, 'error');
            registerBtn.disabled = false;
            progressBar.style.display = 'none';
        }
    }

    // Display result
    function displayResult(data) {
        resultTitle.textContent = 'Successfully Registered!';
        resultMessage.textContent = 'Your image has been registered on the blockchain';
        
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
            { label: 'File Size', value: Utils.formatFileSize(data.file_size) },
            { label: 'Dimensions', value: data.dimensions },
            { label: 'Format', value: data.format },
            { label: 'Transaction Hash', value: data.transaction_hash, class: 'hash' },
            { label: 'Block Number', value: data.block_number },
            { label: 'Gas Used', value: data.gas_used },
            { label: 'Timestamp', value: new Date(data.timestamp).toLocaleString() }
        ];

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
            CertificateGenerator.downloadPDF({ ...uploadedData, isVerified: true });
        } else {
            Utils.showToast('Error', 'CertificateGenerator not loaded', 'error');
        }
    }
});
