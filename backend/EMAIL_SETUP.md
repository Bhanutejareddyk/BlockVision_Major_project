# BlockVision Email Alert Configuration (SMTP)

BlockVision Upgrade #7 introduces automated email security notifications:
1. **Verification Alert**: Sent to the registered image owner whenever someone verifies their digital asset. Includes SHA-256 fingerprint, verification timestamp, verifier IP, and direct audit link.
2. **Transfer Alert**: Sent to both the previous owner and the new owner whenever asset ownership is transferred on-chain.

---

## 1. Environment Variables Configuration

Add the following environment variables to your `.env` (or Vercel Environment Variables in production):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx
```

---

## 2. Generating a Google / Gmail App Password

For security reasons, Google does not allow sending emails with standard account passwords. You must use an **App Password**:

1. Go to your **Google Account** settings: [https://myaccount.google.com/security](https://myaccount.google.com/security)
2. Ensure **2-Step Verification** is turned **ON**.
3. Under *How you sign in to Google*, select **2-Step Verification** and scroll down to **App passwords** (or search "App passwords" in the top search bar).
4. Enter an application name (e.g., `BlockVision`).
5. Click **Create**.
6. Google will display a **16-character password** (e.g., `abcd efgh ijkl mnop`).
7. Copy this 16-character code and paste it as `SMTP_PASS` in `.env` (spaces can be removed or kept as generated).

---

## 3. Alternative SMTP Providers

You can also use other standard SMTP providers by setting the corresponding host and port:

- **SendGrid**: `SMTP_HOST=smtp.sendgrid.net`, `SMTP_PORT=587`, `SMTP_USER=apikey`, `SMTP_PASS=<SendGrid-API-Key>`
- **Mailgun**: `SMTP_HOST=smtp.mailgun.org`, `SMTP_PORT=587`, `SMTP_USER=<Postmaster-User>`, `SMTP_PASS=<Mailgun-Key>`
- **Outlook/Office365**: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_USER=your_email@outlook.com`, `SMTP_PASS=<App-Password>`

---

## 4. Graceful Fallback Behavior (No Crashing)

If `SMTP_HOST`, `SMTP_USER`, or `SMTP_PASS` are unset or if the SMTP connection times out / fails:
- The system logs a descriptive warning: `[EMAIL] SMTP not configured, skipping email to <recipient>`.
- The blockchain transactions (registration, transfer) and verification checks **continue to succeed without interruption**.
- Email alert dispatching runs asynchronously in background threads with a 10-second timeout, ensuring zero latency penalty for frontend users.
