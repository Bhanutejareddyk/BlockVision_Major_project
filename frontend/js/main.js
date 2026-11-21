// Main JavaScript for BlockVision
// Handles global functionality and API calls

// Global helper to get the API base URL
function getApiBase() {
    if (typeof CONFIG !== 'undefined' && typeof CONFIG.API_BASE === 'string') {
        if (CONFIG.API_BASE !== '') return CONFIG.API_BASE;
    }
    const origin = window.location.origin || '';
    if (origin.includes(':3000') || origin.includes(':5500') || origin.includes(':8080') || origin.startsWith('file:')) {
        return 'http://127.0.0.1:5000';
    }
    // Same-origin (Vercel production or local Flask on :5000)
    return '';
}
window.getApiBase = getApiBase;

// API Base URL
const API_BASE_URL = getApiBase();

// Utility Functions
const Utils = {
    // Show toast notification
    showToast(title, message, type = 'info') {
        const toast = document.getElementById('toast');
        if (!toast) return;

        const toastTitle = toast.querySelector('.toast-title');
        const toastMessage = toast.querySelector('.toast-message');

        toastTitle.textContent = title;
        toastMessage.textContent = message;

        const toastIcons = {
            success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
            error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
            warning: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
            info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
        };
        const toastIcon = toast.querySelector('.toast-icon');
        if (toastIcon) {
            toastIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">${toastIcons[type] || toastIcons.info}</svg>`;
        }
        clearTimeout(this._toastTimer);

        // Remove existing type classes
        toast.classList.remove('success', 'error', 'warning', 'info');
        toast.classList.add(type);

        // Show toast
        toast.classList.add('show');

        // Hide after 5 seconds
        this._toastTimer = setTimeout(() => {
            toast.classList.remove('show');
        }, 5000);
    },

    // Format date
    formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // Format address (shorten)
    formatAddress(address) {
        if (!address) return 'N/A';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    },

    // Sepolia Etherscan URL helpers
    getEtherscanTxUrl(txHash) {
        if (!txHash || txHash.startsWith('Not Available') || txHash === 'N/A') return '#';
        return `https://sepolia.etherscan.io/tx/${txHash}`;
    },

    getEtherscanAddressUrl(address) {
        if (!address || address.startsWith('Unassigned') || address === 'N/A') return '#';
        return `https://sepolia.etherscan.io/address/${address}`;
    },

    // Copy to clipboard
    copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('Copied!', 'Text copied to clipboard', 'success');
            }).catch(err => {
                console.error('Copy failed:', err);
            });
        } else {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast('Copied!', 'Text copied to clipboard', 'success');
        }
    },

    // Validate file
    validateImageFile(file) {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp'];
        const maxSize = 16 * 1024 * 1024; // 16MB

        if (!allowedTypes.includes(file.type)) {
            return { valid: false, error: 'Invalid file type. Please upload an image file.' };
        }

        if (file.size > maxSize) {
            return { valid: false, error: 'File too large. Maximum size is 16MB.' };
        }

        return { valid: true };
    },

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
};

// API Service
const API = {
    // Fetch blockchain stats
    async getStats() {
        try {
            const response = await fetch(getApiBase() + '/api/stats');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching stats:', error);
            throw error;
        }
    },

    // Fetch personal dashboard stats
    async getDashboard() {
        try {
            const authHeaders = (typeof Auth !== 'undefined' && Auth.authHeaders) ? Auth.authHeaders() : {};
            const response = await fetch(getApiBase() + '/api/dashboard', {
                headers: authHeaders
            });
            const data = await response.json();
            if (!response.ok) {
                const err = new Error(data.error || 'Failed to fetch dashboard stats');
                err.status = response.status;
                throw err;
            }
            return data;
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            throw error;
        }
    },

    // Batch upload multiple images (up to 10)
    async batchUpload(files, encrypt = false) {
        try {
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append('images', files[i]);
            }
            formData.append('encrypt', encrypt);

            const authHeaders = (typeof Auth !== 'undefined' && Auth.authHeaders) ? Auth.authHeaders() : {};
            const email = localStorage.getItem('bv_email') || '';
            if (email) {
                authHeaders['X-User-Email'] = email;
            }

            const response = await fetch(getApiBase() + '/api/batch-upload', {
                method: 'POST',
                headers: authHeaders,
                body: formData
            });

            const data = await response.json();
            if (!response.ok) {
                const err = new Error(data.error || 'Batch upload failed');
                err.status = response.status;
                err.data = data;
                throw err;
            }
            return data;
        } catch (error) {
            console.error('Error in batch upload:', error);
            throw error;
        }
    },

    // Batch register multiple images on blockchain
    async batchRegister(imagesList) {
        try {
            const authHeaders = (typeof Auth !== 'undefined' && Auth.authHeaders) ? Auth.authHeaders() : {};
            const email = localStorage.getItem('bv_email') || '';
            if (email) {
                authHeaders['X-User-Email'] = email;
            }

            const response = await fetch(getApiBase() + '/api/batch-register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify({
                    images: imagesList
                })
            });

            const data = await response.json();
            if (!response.ok) {
                const err = new Error(data.error || 'Batch registration failed');
                err.status = response.status;
                err.data = data;
                throw err;
            }
            return data;
        } catch (error) {
            console.error('Error in batch register:', error);
            throw error;
        }
    },

    // Upload image
    async uploadImage(file, encrypt = false) {
        try {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('encrypt', encrypt);

            const authHeaders = (typeof Auth !== 'undefined' && Auth.authHeaders) ? Auth.authHeaders() : {};
            const email = localStorage.getItem('bv_email') || '';
            if (email) {
                authHeaders['X-User-Email'] = email;
            }

            const response = await fetch(getApiBase() + '/api/upload', {
                method: 'POST',
                headers: authHeaders,
                body: formData
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            return data;
        } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
        }
    },

    // Register on blockchain
    async registerOnBlockchain(imageHash, filename) {
        try {
            const authHeaders = (typeof Auth !== 'undefined' && Auth.authHeaders) ? Auth.authHeaders() : {};
            const email = localStorage.getItem('bv_email') || '';
            if (email) {
                authHeaders['X-User-Email'] = email;
            }

            const response = await fetch(getApiBase() + '/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify({
                    image_hash: imageHash,
                    filename: filename
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                const err = new Error(data.error || 'Registration failed');
                err.status = response.status;
                err.data = data;
                throw err;
            }

            return data;
        } catch (error) {
            console.error('Error registering on blockchain:', error);
            throw error;
        }
    },

    // Transfer image ownership
    async transferImage(imageHash, newOwner) {
        try {
            const authHeaders = (typeof Auth !== 'undefined' && Auth.authHeaders) ? Auth.authHeaders() : {};
            const email = localStorage.getItem('bv_email') || '';
            if (email) {
                authHeaders['X-User-Email'] = email;
            }

            const response = await fetch(getApiBase() + '/api/transfer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify({
                    image_hash: imageHash,
                    new_owner: newOwner
                })
            });

            const data = await response.json();
            if (!response.ok) {
                const err = new Error(data.error || 'Transfer failed');
                err.status = response.status;
                err.data = data;
                throw err;
            }
            return data;
        } catch (error) {
            console.error('Error transferring image:', error);
            throw error;
        }
    },

    // Revoke image registration
    async revokeImage(imageHash) {
        try {
            const authHeaders = (typeof Auth !== 'undefined' && Auth.authHeaders) ? Auth.authHeaders() : {};
            const email = localStorage.getItem('bv_email') || '';
            if (email) {
                authHeaders['X-User-Email'] = email;
            }

            const response = await fetch(getApiBase() + '/api/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeaders
                },
                body: JSON.stringify({
                    imageHash: imageHash
                })
            });

            const data = await response.json();
            if (!response.ok) {
                const err = new Error(data.error || 'Revocation failed');
                err.status = response.status;
                err.data = data;
                throw err;
            }
            return data;
        } catch (error) {
            console.error('Error revoking image:', error);
            throw error;
        }
    },

    // Get current user's registered images
    async getMyImages() {
        try {
            const authHeaders = (typeof Auth !== 'undefined' && Auth.authHeaders) ? Auth.authHeaders() : {};
            const response = await fetch(getApiBase() + '/api/my-images', {
                headers: authHeaders
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch user images');
            }
            return data;
        } catch (error) {
            console.error('Error fetching user images:', error);
            throw error;
        }
    },

    // Verify image
    async verifyImage(file, notifyEmail = null) {
        try {
            const formData = new FormData();
            formData.append('image', file);
            if (notifyEmail) {
                formData.append('notifyEmail', notifyEmail);
            }

            const email = notifyEmail || localStorage.getItem('bv_email') || '';
            const headers = {};
            if (email) {
                headers['X-Owner-Email'] = email;
            }

            const response = await fetch(getApiBase() + '/api/verify', {
                method: 'POST',
                headers: headers,
                body: formData
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Verification failed');
            }

            return data;
        } catch (error) {
            console.error('Error verifying image:', error);
            throw error;
        }
    },

    // Verify by hash
    async verifyHash(hash, notifyEmail = null) {
        try {
            const email = notifyEmail || localStorage.getItem('bv_email') || '';
            const headers = {
                'Content-Type': 'application/json'
            };
            if (email) {
                headers['X-Owner-Email'] = email;
            }

            const response = await fetch(getApiBase() + '/api/verify-hash', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    image_hash: hash,
                    notifyEmail: email
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Hash verification failed');
            }

            return data;
        } catch (error) {
            console.error('Error verifying hash:', error);
            throw error;
        }
    },

            return data;
        } catch (error) {
            console.error('Error verifying hash:', error);
            throw error;
        }
    },

    // Get user history
    async getUserHistory(address) {
        try {
            const response = await fetch(getApiBase() + `/api/history/${address}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch history');
            }

            return data;
        } catch (error) {
            console.error('Error fetching history:', error);
            throw error;
        }
    },

    // Get all images
    async getAllImages(page = 1, perPage = 20) {
        try {
            const response = await fetch(getApiBase() + `/api/all-images?page=${page}&per_page=${perPage}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch images');
            }

            return data;
        } catch (error) {
            console.error('Error fetching all images:', error);
            throw error;
        }
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Update stats on homepage
    const totalImagesElement = document.getElementById('totalImages');
    if (totalImagesElement) {
        try {
            const stats = await API.getStats();
            if (stats && stats.success) {
                totalImagesElement.textContent = stats.total_images_registered || 0;
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }
});

// Export utilities and API for use in other scripts
window.Utils = Utils;
window.API = API;
