import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime


def send_email(to_email, subject, html_body):
    """
    Sends an email using SMTP credentials from environment variables.
    If configuration is missing or SMTP fails, logs warning and returns False without crashing.
    """
    if not to_email or '@' not in str(to_email):
        return False

    smtp_host = os.getenv('SMTP_HOST')
    smtp_port = os.getenv('SMTP_PORT', '587')
    smtp_user = os.getenv('SMTP_USER')
    smtp_pass = os.getenv('SMTP_PASS')

    if not (smtp_host and smtp_port and smtp_user and smtp_pass):
        print(f"[EMAIL] SMTP not configured, skipping email to {to_email}")
        return False

    try:
        port = int(smtp_port)
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"BlockVision Alerts <{smtp_user}>"
        msg['To'] = to_email

        html_part = MIMEText(html_body, 'html')
        msg.attach(html_part)

        with smtplib.SMTP(smtp_host, port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_email], msg.as_string())

        print(f"[EMAIL] Successfully sent '{subject}' to {to_email}")
        return True

    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send email to {to_email}: {e}")
        return False


def send_verification_alert(owner_email, image_hash, verifier_ip="Unknown"):
    """
    Sends a security alert email when an owner's registered image is verified.
    """
    if not owner_email:
        return False

    subject = "Your image was verified on BlockVision"
    verify_url = f"https://blockvision-nu.vercel.app/verify?hash={image_hash}"
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
            .container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 28px; }}
            .header {{ border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }}
            .badge {{ display: inline-block; background: #eff6ff; color: #2563eb; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px; border: 1px solid #bfdbfe; }}
            .hash-box {{ background: #f1f5f9; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 13px; word-break: break-all; margin: 16px 0; color: #1e293b; }}
            .button {{ display: inline-block; background: #2563eb; color: #ffffff !important; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 14px; }}
            .footer {{ margin-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <span class="badge">BLOCKVISION VERIFICATION EVENT</span>
                <h2 style="margin: 12px 0 0 0; color: #0f172a;">Your image was verified on BlockVision</h2>
            </div>
            <p>An auditor or user has just requested cryptographic verification for your registered image asset.</p>
            
            <div class="hash-box">
                <strong>Image Fingerprint (SHA-256):</strong><br>
                {image_hash}
            </div>

            <p style="font-size: 14px; margin: 8px 0;"><strong>Verification Time:</strong> {timestamp_str}</p>
            <p style="font-size: 14px; margin: 8px 0;"><strong>Verifier IP:</strong> {verifier_ip}</p>

            <a href="{verify_url}" class="button" target="_blank">View Verification Audit Report</a>

            <div class="footer">
                BlockVision Digital Asset Provenance &bull; Ethereum Sepolia Testnet<br>
                This automated notification was generated because email alerts are enabled for this asset.
            </div>
        </div>
    </body>
    </html>
    """

    return send_email(owner_email, subject, html_body)


def send_transfer_alert(old_owner_email, new_owner_email, image_hash, old_wallet=None, new_wallet=None):
    """
    Sends an ownership transfer alert to old owner and new owner (if emails provided).
    """
    subject = "Ownership transferred on BlockVision"
    verify_url = f"https://blockvision-nu.vercel.app/verify?hash={image_hash}"
    timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")

    wallets_html = ""
    if old_wallet or new_wallet:
        wallets_html = f"""
        <p style="font-size: 14px; margin: 8px 0;"><strong>Previous Owner:</strong> {old_wallet or 'N/A'}</p>
        <p style="font-size: 14px; margin: 8px 0;"><strong>New Owner:</strong> {new_wallet or 'N/A'}</p>
        """

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
            .container {{ max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 28px; }}
            .header {{ border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }}
            .badge {{ display: inline-block; background: #ecfdf5; color: #059669; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px; border: 1px solid #a7f3d0; }}
            .hash-box {{ background: #f1f5f9; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 13px; word-break: break-all; margin: 16px 0; color: #1e293b; }}
            .button {{ display: inline-block; background: #059669; color: #ffffff !important; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 14px; }}
            .footer {{ margin-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 14px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <span class="badge">OWNERSHIP TRANSFERRED</span>
                <h2 style="margin: 12px 0 0 0; color: #0f172a;">Ownership Transfer Confirmed</h2>
            </div>
            <p>Ownership of the following image asset has been transferred on the BlockVision blockchain network.</p>
            
            <div class="hash-box">
                <strong>Image Fingerprint (SHA-256):</strong><br>
                {image_hash}
            </div>

            {wallets_html}
            <p style="font-size: 14px; margin: 8px 0;"><strong>Transfer Time:</strong> {timestamp_str}</p>

            <a href="{verify_url}" class="button" target="_blank">View Updated Provenance Record</a>

            <div class="footer">
                BlockVision Digital Asset Provenance &bull; Ethereum Sepolia Testnet
            </div>
        </div>
    </body>
    </html>
    """

    res1 = send_email(old_owner_email, subject, html_body) if old_owner_email else False
    res2 = send_email(new_owner_email, subject, html_body) if new_owner_email else False
    return res1 or res2


def send_otp_email(to_email, otp):
    """
    Sends real-time 6-digit OTP code to recipient's email using Gmail SMTP with App Password.
    Returns dict: {'success': True} or {'success': False, 'error': '...'}
    """
    import traceback

    if not to_email or '@' not in str(to_email):
        return {'success': False, 'error': 'Invalid recipient email address.'}

    smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
    smtp_port = os.getenv('SMTP_PORT', '587')
    smtp_user = os.getenv('SMTP_USER')
    smtp_pass = os.getenv('SMTP_PASS')

    if not (smtp_user and smtp_pass):
        err_msg = "SMTP not configured: Please set SMTP_USER and SMTP_PASS (Gmail App Password) in environment variables."
        print(f"[EMAIL ERROR] {err_msg}")
        return {'success': False, 'error': err_msg}

    try:
        port = int(smtp_port)
        subject = f"BlockVision OTP - {otp}"
        plain_body = f"Your BlockVision OTP is {otp}. Valid for 5 minutes. Do not share."

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
                .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 32px; text-align: center; }}
                .brand {{ font-size: 22px; font-weight: 800; color: #0071e3; letter-spacing: -0.5px; margin-bottom: 8px; }}
                .title {{ font-size: 18px; font-weight: 700; color: #0f172a; margin: 12px 0 6px 0; }}
                .desc {{ color: #475569; font-size: 14px; margin-bottom: 20px; }}
                .otp-box {{ display: inline-block; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #0071e3; background: #eff6ff; border: 2px dashed #93c5fd; padding: 14px 28px; border-radius: 10px; margin: 16px 0; }}
                .warning {{ color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 16px; }}
                .footer {{ margin-top: 28px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 14px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="brand">BlockVision</div>
                <div class="title">Verification Code</div>
                <p class="desc">Your BlockVision OTP is {otp}. Valid for 5 minutes. Do not share.</p>
                <div class="otp-box">{otp}</div>
                <p class="warning">Valid for 5 minutes. If you did not request this code, you can safely ignore this email.</p>
                <div class="footer">BlockVision Digital Asset Provenance &bull; Sepolia Testnet</div>
            </div>
        </body>
        </html>
        """

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = f"BlockVision <{smtp_user}>"
        msg['To'] = to_email

        msg.attach(MIMEText(plain_body, 'plain', 'utf-8'))
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))

        with smtplib.SMTP(smtp_host, port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_email], msg.as_string())

        print(f"[EMAIL] Successfully sent OTP '{subject}' to {to_email}")
        return {'success': True}

    except Exception as e:
        traceback.print_exc()
        err_msg = f"SMTP failed: {str(e)}"
        print(f"[EMAIL ERROR] {err_msg}")
        return {'success': False, 'error': err_msg}
