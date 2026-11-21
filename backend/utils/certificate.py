import io
import os
from datetime import datetime
from config import Config
from utils.blockchain import get_blockchain
from utils.ipfs import get_ipfs_url

def get_verified_image_details(image_hash):
    """Query blockchain first, then fallback to local ledger"""
    image_hash = (image_hash or '').strip().lower()
    blockchain = get_blockchain()
    details = {}
    try:
        details = blockchain.get_image_details(image_hash)
    except Exception as e:
        print(f"[CERTIFICATE] Blockchain lookup error: {e}")
        details = {'exists': False}

    if not details.get('exists'):
        try:
            from utils.local_ledger import LocalLedger
            local = LocalLedger()
            local_details = local.get_image_details(image_hash)
            if local_details.get('exists'):
                details = local_details
        except Exception as le:
            print(f"[CERTIFICATE] Local ledger fallback error: {le}")

    return details


def generate_certificate_pdf(image_hash):
    """
    Generate professional vector A4 PDF certificate for a registered image.
    Uses built-in Helvetica font and embedded QR code pointing to live verify link.
    """
    details = get_verified_image_details(image_hash)
    if not details or not details.get('exists'):
        return None, "Image registration not found"

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        from reportlab.lib.colors import HexColor
        from reportlab.lib.utils import ImageReader
    except ImportError:
        return None, "PDF generation library (reportlab) not available"

    image_hash = details.get('image_hash', image_hash)
    filename = details.get('file_name', 'Unknown')
    owner = details.get('owner', 'Unknown')
    timestamp = details.get('timestamp', int(datetime.now().timestamp()))
    reg_date = datetime.fromtimestamp(timestamp).strftime('%B %d, %Y at %H:%M:%S UTC')
    ipfs_cid = details.get('ipfsCID') or details.get('ipfs_cid', '')
    is_revoked = bool(details.get('isRevoked', False))

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4  # 595.27 x 841.89 points

    # Background subtle border
    c.setStrokeColor(HexColor('#e2e8f0'))
    c.setLineWidth(1)
    c.roundRect(24, 24, width - 48, height - 48, 8)

    # Top Brand Header
    c.setFont('Helvetica-Bold', 10)
    c.setFillColor(HexColor('#64748b'))
    c.drawString(44, height - 56, 'BLOCKVISION  |  DIGITAL ASSET PROVENANCE SYSTEM')

    # Main Title
    c.setFont('Helvetica-Bold', 18)
    c.setFillColor(HexColor('#0f172a'))
    title = 'BLOCKCHAIN IMAGE REVOCATION REPORT' if is_revoked else 'BLOCKCHAIN IMAGE VERIFICATION CERTIFICATE'
    c.drawString(44, height - 84, title)

    # Status Badge
    badge_x = width - 210
    badge_y = height - 90
    if is_revoked:
        c.setFillColor(HexColor('#fef2f2'))
        c.setStrokeColor(HexColor('#dc2626'))
        c.roundRect(badge_x, badge_y, 166, 26, 4, fill=1, stroke=1)
        c.setFont('Helvetica-Bold', 10)
        c.setFillColor(HexColor('#dc2626'))
        c.drawCentredString(badge_x + 83, badge_y + 8, 'REGISTRATION REVOKED')
    else:
        c.setFillColor(HexColor('#eff6ff'))
        c.setStrokeColor(HexColor('#2563eb'))
        c.roundRect(badge_x, badge_y, 166, 26, 4, fill=1, stroke=1)
        c.setFont('Helvetica-Bold', 10)
        c.setFillColor(HexColor('#2563eb'))
        c.drawCentredString(badge_x + 83, badge_y + 8, 'VERIFIED & AUTHENTIC')

    # Divider line
    c.setStrokeColor(HexColor('#cbd5e1'))
    c.setLineWidth(0.8)
    c.line(44, height - 105, width - 44, height - 105)

    # QR Code Generation (wrapped in try/except)
    qr_drawn = False
    try:
        import qrcode
        live_verify_url = f"https://blockvision-nu.vercel.app/verify?hash={image_hash}"
        qr = qrcode.QRCode(box_size=4, border=1)
        qr.add_data(live_verify_url)
        qr.make(fit=True)
        qr_img = qr.make_image(fill_color='black', back_color='white')
        
        qr_buf = io.BytesIO()
        qr_img.save(qr_buf, format='PNG')
        qr_buf.seek(0)
        
        qr_size = 100
        qr_x = width - 44 - qr_size
        qr_y = height - 230
        c.drawImage(ImageReader(qr_buf), qr_x, qr_y, width=qr_size, height=qr_size)
        c.setFont('Helvetica', 8)
        c.setFillColor(HexColor('#64748b'))
        c.drawCentredString(qr_x + (qr_size / 2), qr_y - 12, 'Scan to verify on live app')
        qr_drawn = True
    except Exception as qe:
        print(f"[CERTIFICATE WARNING] QR code generation skipped: {qe}")

    # Section 1: Asset Information
    y = height - 135
    c.setFont('Helvetica-Bold', 12)
    c.setFillColor(HexColor('#1e293b'))
    c.drawString(44, y, 'Registered Asset Details')
    y -= 18

    def draw_field(label, val, y_pos, is_mono=False):
        c.setFont('Helvetica-Bold', 9)
        c.setFillColor(HexColor('#475569'))
        c.drawString(44, y_pos, label)
        
        c.setFont('Courier' if is_mono else 'Helvetica', 9)
        c.setFillColor(HexColor('#0f172a'))
        # If val is too long, truncate or split
        c.drawString(180, y_pos, str(val)[:68])
        return y_pos - 20

    y = draw_field('Original Filename:', filename, y)
    y = draw_field('Fingerprint (SHA-256):', image_hash, y, is_mono=True)
    y = draw_field('Registered Owner:', owner, y, is_mono=True)
    y = draw_field('Registration Timestamp:', reg_date, y)
    y = draw_field('IPFS Storage CID:', ipfs_cid or 'Pinned via Pinata Gateway', y, is_mono=True)
    y = draw_field('Verification Network:', f"Ethereum Sepolia (Chain ID: {Config.CHAIN_ID})", y)

    # Section 2: Cryptographic Proof Details
    y -= 15
    c.setFont('Helvetica-Bold', 12)
    c.setFillColor(HexColor('#1e293b'))
    c.drawString(44, y, 'Cryptographic Proof & Provenance')
    y -= 18

    y = draw_field('Algorithm:', 'SHA-256 Cryptographic Hash Digest', y)
    y = draw_field('Immutability:', 'Secured on decentralized ledger / Smart Contract', y)
    y = draw_field('Public Audit URL:', f"https://blockvision-nu.vercel.app/verify?hash={image_hash[:16]}...", y)

    # Notice Box
    y -= 25
    box_h = 70
    c.setFillColor(HexColor('#f8fafc'))
    c.setStrokeColor(HexColor('#e2e8f0'))
    c.roundRect(44, y - box_h, width - 88, box_h, 6, fill=1, stroke=1)

    c.setFont('Helvetica-Bold', 9)
    c.setFillColor(HexColor('#334155'))
    c.drawString(56, y - 20, 'LEGAL & PROVENANCE NOTICE')
    c.setFont('Helvetica', 8)
    c.setFillColor(HexColor('#64748b'))
    notice_text = (
        "This certificate provides cryptographic mathematical proof that the digital file with the exact SHA-256 fingerprint "
        "indicated above was registered on the blockchain at the specified timestamp by the identified wallet owner. "
        "Any alteration to even one pixel of the original digital asset completely changes its cryptographic digest, "
        "rendering unverified copies mathematically invalid."
    )
    # Simple line wrap for notice
    words = notice_text.split()
    line = ""
    text_y = y - 35
    for word in words:
        if len(line + " " + word) > 105:
            c.drawString(56, text_y, line.strip())
            text_y -= 12
            line = word
        else:
            line += " " + word
    if line:
        c.drawString(56, text_y, line.strip())

    # Footer
    c.setFont('Helvetica', 8)
    c.setFillColor(HexColor('#94a3b8'))
    c.drawString(44, 42, f"BlockVision 2.0  •  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    c.drawRightString(width - 44, 42, 'Page 1 of 1  •  Official Digital Provenance Record')

    c.save()
    buf.seek(0)
    pdf_bytes = buf.getvalue()
    pdf_filename = f"certificate-{image_hash[:16]}.pdf"
    return pdf_bytes, pdf_filename


def generate_certificate_html(image_hash):
    """
    Generate clean, printable HTML certificate page with Print button (window.print())
    Used as universal browser fallback.
    """
    details = get_verified_image_details(image_hash)
    if not details or not details.get('exists'):
        return None

    filename = details.get('file_name', 'Unknown')
    owner = details.get('owner', 'Unknown')
    timestamp = details.get('timestamp', int(datetime.now().timestamp()))
    reg_date = datetime.fromtimestamp(timestamp).strftime('%B %d, %Y at %H:%M:%S UTC')
    ipfs_cid = details.get('ipfsCID') or details.get('ipfs_cid', '')
    is_revoked = bool(details.get('isRevoked', False))
    live_verify_url = f"https://blockvision-nu.vercel.app/verify?hash={image_hash}"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Certificate - {image_hash[:12]} - BlockVision</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 40px 20px;
        }}
        .cert-container {{
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }}
        .header {{
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 28px;
        }}
        .brand {{
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }}
        .title {{
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 6px;
        }}
        .badge {{
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            border: 1px solid;
        }}
        .badge-verified {{
            background: #eff6ff;
            color: #2563eb;
            border-color: #93c5fd;
        }}
        .badge-revoked {{
            background: #fef2f2;
            color: #dc2626;
            border-color: #fca5a5;
        }}
        .section-title {{
            font-size: 14px;
            font-weight: 700;
            color: #334155;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-top: 24px;
            margin-bottom: 12px;
        }}
        .grid {{
            display: grid;
            grid-template-columns: 200px 1fr;
            gap: 12px 16px;
            font-size: 13.5px;
            padding: 16px;
            background: #f8fafc;
            border-radius: 8px;
            border: 1px solid #f1f5f9;
        }}
        .label {{
            font-weight: 600;
            color: #64748b;
        }}
        .value {{
            color: #0f172a;
            word-break: break-all;
        }}
        .mono {{
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }}
        .footer {{
            margin-top: 32px;
            padding-top: 20px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #94a3b8;
        }}
        .no-print {{
            text-align: center;
            margin-bottom: 24px;
        }}
        .btn-print {{
            background: #2563eb;
            color: #ffffff;
            border: none;
            padding: 10px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
        }}
        @media print {{
            body {{
                background: #ffffff;
                padding: 0;
            }}
            .cert-container {{
                border: none;
                box-shadow: none;
                padding: 20px;
            }}
            .no-print {{
                display: none;
            }}
        }}
    </style>
</head>
<body>
    <div class="no-print">
        <button class="btn-print" onclick="window.print()">Print to PDF / Save</button>
        <a href="/verify?hash={image_hash}" style="margin-left: 12px; color: #2563eb; text-decoration: none; font-size: 14px;">Verify Online</a>
    </div>

    <div class="cert-container">
        <div class="header">
            <div>
                <div class="brand">BlockVision &middot; Digital Asset Provenance System</div>
                <div class="title">{'Blockchain Image Revocation Report' if is_revoked else 'Blockchain Image Verification Certificate'}</div>
            </div>
            <div>
                <span class="badge {'badge-revoked' if is_revoked else 'badge-verified'}">
                    {'REGISTRATION REVOKED' if is_revoked else 'VERIFIED & AUTHENTIC'}
                </span>
            </div>
        </div>

        <div class="section-title">Asset Provenance Records</div>
        <div class="grid">
            <div class="label">Original Filename:</div>
            <div class="value">{filename}</div>
            <div class="label">Fingerprint (SHA-256):</div>
            <div class="value mono">{image_hash}</div>
            <div class="label">Registered Owner:</div>
            <div class="value mono">{owner}</div>
            <div class="label">Registration Date:</div>
            <div class="value">{reg_date}</div>
            <div class="label">IPFS Storage CID:</div>
            <div class="value mono">{ipfs_cid or 'Not Uploaded'}</div>
            <div class="label">Verification Link:</div>
            <div class="value"><a href="{live_verify_url}" target="_blank" style="color: #2563eb;">{live_verify_url}</a></div>
        </div>

        <div class="section-title">Cryptographic Guarantee</div>
        <div class="grid">
            <div class="label">Hash Algorithm:</div>
            <div class="value">SHA-256 Cryptographic Hash</div>
            <div class="label">Status:</div>
            <div class="value">{'Revoked by Owner' if is_revoked else 'Active and Immutable'}</div>
        </div>

        <div class="footer">
            <div>BlockVision 2.0 &bull; Sepolia Testnet</div>
            <div>Official Digital Provenance Record</div>
        </div>
    </div>
</body>
</html>"""
    return html
