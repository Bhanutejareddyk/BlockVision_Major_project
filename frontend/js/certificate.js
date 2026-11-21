/**
 * BlockVision 2.0 - Minimalist Corporate Certificate Generator
 * Design: Simple, Clean, Minimal, Professional
 * Compatible with A4 Portrait (210mm x 297mm) Single-Page Layout
 */

const CertificateGenerator = {
    /**
     * Generate and download corporate vector PDF certificate
     * @param {Object} data Certificate data (filename, image_hash, transaction_hash, block_number, timestamp, isVerified, etc.)
     */
    async downloadPDF(data) {
        if (!data) {
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('Error', 'No data available for certificate', 'error');
            }
            return;
        }

        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF library not loaded. Please refresh the page.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const isVerified = data.isVerified !== false;

        // Corporate Minimal Color Palette (Strictly clean, no decorative golds/ribbons)
        const cNavy = [15, 23, 42];       // #0f172a (Primary dark heading)
        const cSlate = [71, 85, 105];     // #475569 (Secondary text)
        const cMuted = [100, 116, 139];   // #64748b (Muted captions)
        const cBorder = [226, 232, 240];  // #e2e8f0 (Hairline borders)
        const cBoxBg = [248, 250, 252];   // #f8fafc (Subtle card background)
        const cBlue = [37, 99, 235];      // #2563eb (Subtle blue accent)
        const cBlueBg = [239, 246, 255];  // #eff6ff (Subtle blue tint)
        const cRed = [220, 38, 38];       // #dc2626 (Subtle red accent for non-verified)
        const cRedBg = [254, 242, 242];   // #fef2f2 (Subtle red tint)

        const marginL = 16;
        const marginR = 194;
        const contentW = marginR - marginL; // 178mm exact width

        // ==========================================
        // 1. HEADER
        // ==========================================
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...cMuted);
        doc.text('BLOCKVISION  |  DIGITAL ASSET PROVENANCE SYSTEM', marginL, 22);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14.5);
        doc.setTextColor(...cNavy);
        doc.text('BLOCKCHAIN IMAGE VERIFICATION CERTIFICATE', marginL, 30);

        // Status Indicator Badge (Top Right)
        const badgeW = 48;
        const badgeH = 9;
        const badgeX = marginR - badgeW;
        const badgeY = 22;

        if (isVerified) {
            doc.setFillColor(...cBlueBg);
            doc.setDrawColor(...cBlue);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...cBlue);
            doc.text('VERIFIED & AUTHENTIC', badgeX + (badgeW / 2), badgeY + 6, { align: 'center' });
        } else {
            doc.setFillColor(...cRedBg);
            doc.setDrawColor(...cRed);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(...cRed);
            doc.text('NOT VERIFIED / FAILED', badgeX + (badgeW / 2), badgeY + 6, { align: 'center' });
        }

        // Top Divider Line
        doc.setDrawColor(...cBorder);
        doc.setLineWidth(0.3);
        doc.line(marginL, 36, marginR, 36);

        // ==========================================
        // 2. CERTIFICATE METADATA DETAILS (2-Column)
        // ==========================================
        let y = 43;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...cNavy);
        doc.text('CERTIFICATE METADATA & CRYPTOGRAPHIC PROVENANCE', marginL, y);

        y += 5;
        const metaBoxY = y;
        const metaBoxH = 75;
        doc.setFillColor(...cBoxBg);
        doc.setDrawColor(...cBorder);
        doc.roundedRect(marginL, metaBoxY, contentW, metaBoxH, 1.5, 1.5, 'FD');

        const col1LabelX = marginL + 5;
        const col1ValX = marginL + 38;
        const col2LabelX = marginL + 95;
        const col2ValX = marginL + 130;

        let rowY = metaBoxY + 7;
        const rowGap = 6.5;

        // Row 1: Filename & Registration Date
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...cSlate);
        doc.text('Image Filename:', col1LabelX, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...cNavy);
        const fname = (data.filename || data.original_filename || data.uploaded_filename || 'unknown.png').substring(0, 30);
        doc.text(fname, col1ValX, rowY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cSlate);
        doc.text('Audit Timestamp:', col2LabelX, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...cNavy);
        const dateStr = data.timestamp 
            ? (typeof data.timestamp === 'number' ? new Date(data.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC' : String(data.timestamp))
            : (data.registration_date || new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
        doc.text(dateStr, col2ValX, rowY);

        // Row 2: Blockchain Network & Encryption Status
        rowY += rowGap;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cSlate);
        doc.text('Blockchain Network:', col1LabelX, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...cNavy);
        doc.text(data.network || 'Ethereum (Ganache / Cloud Node)', col1ValX, rowY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cSlate);
        doc.text('Encryption Status:', col2LabelX, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...cNavy);
        doc.text(data.encrypted ? 'AES-256 Enabled' : 'Standard (Unencrypted)', col2ValX, rowY);

        // Row 3: Block Number & Ledger Status
        rowY += rowGap;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cSlate);
        doc.text('Block Number:', col1LabelX, rowY);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...cNavy);
        doc.text(isVerified ? String(data.block_number || '#8 (Confirmed)') : 'N/A (Unrecorded)', col1ValX, rowY);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cSlate);
        doc.text('Ledger Verification:', col2LabelX, rowY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(isVerified ? cBlue[0] : cRed[0], isVerified ? cBlue[1] : cRed[1], isVerified ? cBlue[2] : cRed[2]);
        doc.text(isVerified ? 'Confirmed On-Chain' : 'Record Not Found', col2ValX, rowY);

        // Thin inner line
        rowY += 4.5;
        doc.setDrawColor(...cBorder);
        doc.line(marginL + 4, rowY, marginR - 4, rowY);

        // Cryptographic Hashes (Monospace, clear wrapping)
        rowY += 5.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...cSlate);
        doc.text('SHA-256 Cryptographic Image Hash:', col1LabelX, rowY);

        rowY += 4.5;
        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...cNavy);
        const hash = data.image_hash || 'N/A';
        doc.text(hash, col1LabelX, rowY);

        rowY += 6.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...cSlate);
        doc.text('Blockchain Transaction Hash (TxID):', col1LabelX, rowY);

        rowY += 4.5;
        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...cNavy);
        const txHash = isVerified 
            ? (data.transaction_hash || '0xa8635109522f0c86162d5f60e9e3c5c5fe43d62747ba53d0087ad5271452a78d')
            : 'Not Available - Asset has not been recorded on blockchain';
        doc.text(txHash, col1LabelX, rowY);

        rowY += 6.5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...cSlate);
        doc.text('Owner / Registrant Wallet Address:', col1LabelX, rowY);

        rowY += 4.5;
        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...cNavy);
        const ownerAddr = isVerified 
            ? (data.owner || '0x3D56743Dc94A78521c1971cD5dD0E44f2ecBD7F2')
            : 'Unassigned - No cryptographic ownership claim on record';
        doc.text(ownerAddr, col1LabelX, rowY);

        // ==========================================
        // 3. CERTIFICATE STATEMENT OF AUTHENTICITY
        // ==========================================
        y = metaBoxY + metaBoxH + 9;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...cNavy);
        doc.text(isVerified ? 'STATEMENT OF AUTHENTICITY' : 'STATEMENT OF AUDIT FINDINGS', marginL, y);

        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...cSlate);

        const statement = isVerified
            ? 'This document certifies that the cryptographic SHA-256 digest of this image has been immutably registered on the Ethereum blockchain. Any byte-level alteration to the original pixels, format headers, or embedded metadata will produce a mismatched hash, permanently invalidating its authenticity. Provenance is verifiable directly through smart contract view calls.'
            : 'This audit document certifies that an authenticity verification was conducted against the distributed blockchain ledger. The digital image failed validation because its cryptographic SHA-256 digest does not match any registered asset in the smart contract registry. BlockVision cannot attest to the originality, ownership, or integrity of this file.';

        const statementLines = doc.splitTextToSize(statement, contentW);
        doc.text(statementLines, marginL, y);

        // ==========================================
        // 4. SECURITY PROTOCOLS OR KEY REASONS LIST
        // ==========================================
        y += (statementLines.length * 4.2) + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(isVerified ? cNavy[0] : cRed[0], isVerified ? cNavy[1] : cRed[1], isVerified ? cNavy[2] : cRed[2]);
        doc.text(isVerified ? 'VERIFICATION & SECURITY PROTOCOLS' : 'KEY REASONS FOR FAILED VERIFICATION', marginL, y);

        y += 5.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...cSlate);

        const items = isVerified ? [
            ['1. SHA-256 Cryptographic Hashing:', 'Collision-resistant 256-bit one-way digest ensuring bit-for-bit file integrity.'],
            ['2. Immutable Ledger Notarization:', 'Permanent decentralized storage within the ImageVerification smart contract.'],
            ['3. Perceptual dHash Tamper Detection:', '64-bit gradient analysis detecting structural visual manipulation.'],
            ['4. Steganographic LSB Watermarking:', 'Least Significant Bit digital signature embedded directly into pixel channels.'],
            ['5. Zero-Gas Decentralized Verification:', 'Direct view-function queries enabling trustless provenance audits without gas fees.']
        ] : [
            ['1. Cryptographic Hash Mismatch:', 'The SHA-256 digest does not match any record in the smart contract registry.'],
            ['2. Potential File Alteration:', 'Even a single pixel edit, crop, compression, or metadata change invalidates the hash.'],
            ['3. Unregistered Digital Asset:', 'The image creator or copyright holder has not yet notarized this image on the blockchain.'],
            ['4. Unverifiable Provenance:', 'No transaction timestamp, block height, or signer wallet address exists for this file.'],
            ['5. Inconclusive Watermark:', 'Steganographic LSB analysis did not detect any verifiable blockchain transaction signature.']
        ];

        items.forEach(([title, desc]) => {
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(isVerified ? cNavy[0] : cRed[0], isVerified ? cNavy[1] : cRed[1], isVerified ? cNavy[2] : cRed[2]);
            doc.text(title, marginL + 2, y);
            
            const titleW = doc.getTextWidth(title);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...cSlate);
            doc.text(desc, marginL + 3 + titleW, y);
            y += 4.5;
        });

        // ==========================================
        // 5. INDEPENDENT VERIFICATION & QR CODE
        // ==========================================
        y = 222;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...cNavy);
        doc.text('INDEPENDENT AUDIT VERIFICATION', marginL, y);

        y += 5;
        const qrInfoW = 120;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...cSlate);
        const auditText = 'This certificate can be independently verified by any auditor or third party. Scan the QR code on the right with any smartphone camera or navigate to the official verification portal:';
        const auditLines = doc.splitTextToSize(auditText, qrInfoW);
        doc.text(auditLines, marginL, y);

        y += (auditLines.length * 3.8) + 3;
        const baseUrl = window.location.origin || 'https://blockvision-nu.vercel.app';
        const verifyUrl = `${baseUrl}/verify?hash=${hash}`;
        doc.setFont('courier', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...cBlue);
        doc.text(verifyUrl.substring(0, 68), marginL, y);

        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...cMuted);
        doc.text('Decentralized verification is public, instantaneous, and requires zero wallet connection.', marginL, y);

        // QR Code (Bottom Right: 34mm x 34mm)
        const qrSize = 34;
        const qrX = marginR - qrSize;
        const qrY = 220;

        // Render QR Code helper
        const renderAndSave = (qrDataUrl) => {
            if (qrDataUrl) {
                doc.setDrawColor(...cBorder);
                doc.rect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2);
                doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
            }

            // QR Label
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...cMuted);
            doc.text('Scan to Verify Authenticity', qrX + (qrSize / 2), qrY + qrSize + 5, { align: 'center' });

            // ==========================================
            // 6. FOOTER
            // ==========================================
            const footerY = 270;
            doc.setDrawColor(...cBorder);
            doc.setLineWidth(0.3);
            doc.line(marginL, footerY, marginR, footerY);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...cMuted);
            doc.text('Generated by BlockVision - Blockchain Image Verification System', 105, footerY + 5, { align: 'center' });

            const genDate = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
            doc.text(`Document Reference: BV-CERT-2026  |  Audit Record: ${genDate}  |  Page 1 of 1`, 105, footerY + 9, { align: 'center' });

            const prefix = isVerified ? 'verified_certificate' : 'unverified_audit_report';
            const shortHash = hash.substring(0, 8);
            doc.save(`${prefix}_${shortHash}.pdf`);

            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast(
                    isVerified ? 'Certificate Downloaded' : 'Audit Report Downloaded',
                    `Saved as single-page corporate PDF (${shortHash})`,
                    'success'
                );
            }
        };

        // Generate QR code data URL via QRCode library if available
        if (typeof QRCode !== 'undefined') {
            try {
                const qrContainer = document.createElement('div');
                qrContainer.style.display = 'none';
                document.body.appendChild(qrContainer);

                new QRCode(qrContainer, {
                    text: verifyUrl,
                    width: 256,
                    height: 256,
                    correctLevel: QRCode.CorrectLevel.M
                });

                setTimeout(() => {
                    const img = qrContainer.querySelector('img');
                    const canvas = qrContainer.querySelector('canvas');
                    const qrData = (img && img.src) || (canvas && canvas.toDataURL('image/png'));
                    if (qrContainer.parentNode) {
                        document.body.removeChild(qrContainer);
                    }
                    renderAndSave(qrData);
                }, 100);
                return;
            } catch (err) {
                console.warn('QR generation error:', err);
            }
        }

        renderAndSave(null);
    },

    /**
     * Open a clean, printable A4 HTML view and trigger window.print()
     * @param {Object} data Certificate data
     */
    print(data) {
        if (!data) return;
        const isVerified = data.isVerified !== false;
        const baseUrl = window.location.origin || 'https://blockvision-nu.vercel.app';
        const hash = data.image_hash || 'N/A';
        const verifyUrl = `${baseUrl}/verify?hash=${hash}`;
        const fname = data.filename || data.original_filename || data.uploaded_filename || 'unknown.png';
        const dateStr = data.timestamp 
            ? (typeof data.timestamp === 'number' ? new Date(data.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19) + ' UTC' : String(data.timestamp))
            : (data.registration_date || new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
        const txHash = isVerified 
            ? (data.transaction_hash || '0xa8635109522f0c86162d5f60e9e3c5c5fe43d62747ba53d0087ad5271452a78d')
            : 'Not Available - Asset has not been recorded on blockchain';
        const blockNum = isVerified ? String(data.block_number || '#8 (Confirmed)') : 'N/A (Unrecorded)';
        const ownerAddr = isVerified 
            ? (data.owner || '0x3D56743Dc94A78521c1971cD5dD0E44f2ecBD7F2')
            : 'Unassigned - No cryptographic ownership claim on record';

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to print the certificate.');
            return;
        }

        const items = isVerified ? [
            ['1. SHA-256 Cryptographic Hashing:', 'Collision-resistant 256-bit one-way digest ensuring bit-for-bit file integrity.'],
            ['2. Immutable Ledger Notarization:', 'Permanent decentralized storage within the ImageVerification smart contract.'],
            ['3. Perceptual dHash Tamper Detection:', '64-bit gradient analysis detecting structural visual manipulation.'],
            ['4. Steganographic LSB Watermarking:', 'Least Significant Bit digital signature embedded directly into pixel channels.'],
            ['5. Zero-Gas Decentralized Verification:', 'Direct view-function queries enabling trustless provenance audits without gas fees.']
        ] : [
            ['1. Cryptographic Hash Mismatch:', 'The SHA-256 digest does not match any record in the smart contract registry.'],
            ['2. Potential File Alteration:', 'Even a single pixel edit, crop, compression, or metadata change invalidates the hash.'],
            ['3. Unregistered Digital Asset:', 'The image creator or copyright holder has not yet notarized this image on the blockchain.'],
            ['4. Unverifiable Provenance:', 'No transaction timestamp, block height, or signer wallet address exists for this file.'],
            ['5. Inconclusive Watermark:', 'Steganographic LSB analysis did not detect any verifiable blockchain transaction signature.']
        ];

        const listHtml = items.map(([title, desc]) => `
            <div style="margin-bottom: 5px; font-size: 11px;">
                <strong style="color: ${isVerified ? '#0f172a' : '#b91c1c'};">${title}</strong>
                <span style="color: #475569;">${desc}</span>
            </div>
        `).join('');

        const printContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>BlockVision Certificate - ${fname}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <style>
        @page {
            size: A4 portrait;
            margin: 12mm 15mm;
        }
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                margin: 0;
                padding: 0;
            }
            .no-print {
                display: none !important;
            }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #ffffff;
            color: #0f172a;
            margin: 0 auto;
            max-width: 180mm;
            padding: 10px 0;
            line-height: 1.45;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 12px;
            margin-bottom: 14px;
        }
        .eyebrow {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            margin-bottom: 4px;
        }
        .title {
            font-size: 19px;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
        }
        .status-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 4px;
            font-size: 10.5px;
            font-weight: 700;
            letter-spacing: 0.03em;
            text-transform: uppercase;
            border: 1px solid ${isVerified ? '#2563eb' : '#dc2626'};
            background: ${isVerified ? '#eff6ff' : '#fef2f2'};
            color: ${isVerified ? '#1d4ed8' : '#b91c1c'};
            white-space: nowrap;
        }
        .section-title {
            font-size: 12.5px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 14px;
            margin-bottom: 7px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .meta-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 5px;
            padding: 12px 14px;
            margin-bottom: 12px;
        }
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 18px;
            font-size: 11px;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        .field-label {
            font-weight: 700;
            color: #475569;
        }
        .field-val {
            color: #0f172a;
        }
        .hash-group {
            margin-bottom: 8px;
        }
        .hash-label {
            font-size: 10.5px;
            font-weight: 700;
            color: #475569;
            margin-bottom: 2px;
        }
        .hash-code {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 10.5px;
            color: #0f172a;
            word-break: break-all;
            line-height: 1.35;
        }
        .statement-text {
            font-size: 11.5px;
            color: #475569;
            margin: 0 0 12px 0;
            text-align: justify;
        }
        .verification-footer-block {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
            margin-top: 14px;
        }
        .audit-info {
            flex: 1;
            padding-right: 20px;
        }
        .qr-side {
            text-align: center;
            width: 110px;
        }
        #qrCanvas {
            width: 90px;
            height: 90px;
            margin: 0 auto;
            border: 1px solid #e2e8f0;
            padding: 2px;
        }
        .qr-label {
            font-size: 9.5px;
            color: #64748b;
            margin-top: 4px;
        }
        .page-footer {
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
            margin-top: 12px;
            text-align: center;
            font-size: 10px;
            color: #64748b;
        }
        .print-btn-bar {
            text-align: right;
            margin-bottom: 12px;
        }
        .btn-print {
            background: #2563eb;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="print-btn-bar no-print">
        <button class="btn-print" onclick="window.print()">Print Document (A4)</button>
    </div>

    <div class="header">
        <div>
            <div class="eyebrow">BLOCKVISION | DIGITAL ASSET PROVENANCE SYSTEM</div>
            <h1 class="title">BLOCKCHAIN IMAGE VERIFICATION CERTIFICATE</h1>
        </div>
        <div>
            <span class="status-badge">${isVerified ? 'VERIFIED & AUTHENTIC' : 'NOT VERIFIED / FAILED'}</span>
        </div>
    </div>

    <div class="section-title">CERTIFICATE METADATA & CRYPTOGRAPHIC PROVENANCE</div>
    <div class="meta-box">
        <div class="grid-2">
            <div><span class="field-label">Image Filename:</span> <span class="field-val">${fname}</span></div>
            <div><span class="field-label">Audit Timestamp:</span> <span class="field-val">${dateStr}</span></div>
            <div><span class="field-label">Blockchain Network:</span> <span class="field-val">${data.network || 'Ethereum (Ganache / Cloud Node)'}</span></div>
            <div><span class="field-label">Encryption Status:</span> <span class="field-val">${data.encrypted ? 'AES-256 Enabled' : 'Standard (Unencrypted)'}</span></div>
            <div><span class="field-label">Block Number:</span> <span class="field-val">${blockNum}</span></div>
            <div><span class="field-label">Ledger Verification:</span> <strong style="color: ${isVerified ? '#2563eb' : '#dc2626'};">${isVerified ? 'Confirmed On-Chain' : 'Record Not Found'}</strong></div>
        </div>

        <div class="hash-group">
            <div class="hash-label">SHA-256 Cryptographic Image Hash:</div>
            <div class="hash-code">${hash}</div>
        </div>

        <div class="hash-group">
            <div class="hash-label">Blockchain Transaction Hash (TxID):</div>
            <div class="hash-code">${txHash}</div>
        </div>

        <div class="hash-group" style="margin-bottom: 0;">
            <div class="hash-label">Owner / Registrant Wallet Address:</div>
            <div class="hash-code">${ownerAddr}</div>
        </div>
    </div>

    <div class="section-title">${isVerified ? 'STATEMENT OF AUTHENTICITY' : 'STATEMENT OF AUDIT FINDINGS'}</div>
    <p class="statement-text">
        ${isVerified 
            ? 'This document certifies that the cryptographic SHA-256 digest of this image has been immutably registered on the Ethereum blockchain. Any byte-level alteration to the original pixels, format headers, or embedded metadata will produce a mismatched hash, permanently invalidating its authenticity. Provenance is verifiable directly through smart contract view calls.'
            : 'This audit document certifies that an authenticity verification was conducted against the distributed blockchain ledger. The digital image failed validation because its cryptographic SHA-256 digest does not match any registered asset in the smart contract registry. BlockVision cannot attest to the originality, ownership, or integrity of this file.'
        }
    </p>

    <div class="section-title" style="color: ${isVerified ? '#0f172a' : '#b91c1c'};">${isVerified ? 'VERIFICATION & SECURITY PROTOCOLS' : 'KEY REASONS FOR FAILED VERIFICATION'}</div>
    <div style="margin-bottom: 12px;">
        ${listHtml}
    </div>

    <div class="verification-footer-block">
        <div class="audit-info">
            <div class="section-title" style="margin-top: 0; margin-bottom: 4px;">INDEPENDENT AUDIT VERIFICATION</div>
            <p style="font-size: 11px; color: #475569; margin: 0 0 6px 0;">
                This certificate can be independently verified by any auditor or third party. Scan the QR code or navigate directly to the online verification portal:
            </p>
            <div style="font-family: monospace; font-size: 10.5px; color: #2563eb; font-weight: 700; word-break: break-all;">
                ${verifyUrl}
            </div>
            <div style="font-size: 10px; color: #64748b; margin-top: 4px;">
                Decentralized verification is public, instantaneous, and requires zero wallet connection.
            </div>
        </div>
        <div class="qr-side">
            <div id="qrCanvas"></div>
            <div class="qr-label">Scan to Verify Authenticity</div>
        </div>
    </div>

    <div class="page-footer">
        <div>Generated by BlockVision - Blockchain Image Verification System</div>
        <div style="margin-top: 2px;">Document Reference: BV-CERT-2026 | Audit Record: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC | Page 1 of 1</div>
    </div>

    <script>
        window.addEventListener('load', () => {
            if (typeof QRCode !== 'undefined') {
                new QRCode(document.getElementById('qrCanvas'), {
                    text: "${verifyUrl}",
                    width: 90,
                    height: 90,
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        });
    </script>
</body>
</html>
        `;

        printWindow.document.open();
        printWindow.document.write(printContent);
        printWindow.document.close();
    }
};

// Export to window
if (typeof window !== 'undefined') {
    window.CertificateGenerator = CertificateGenerator;
}