// --- Email notifications -----------------------------------------------------
// Preferred: Google Workspace SMTP (frame-frqnc.com mailboxes).
//   SMTP_USER   a Workspace mailbox, e.g. kerapetse@frame-frqnc.com
//   SMTP_PASS   a Google App Password for that mailbox (requires 2-Step Verification)
//   EMAIL_FROM  optional display sender, e.g. "Frame & Frqnc Planner <planner@frame-frqnc.com>"
//               (must be SMTP_USER itself or an alias / "Send mail as" address on it)
//   SMTP_HOST / SMTP_PORT optional, default smtp.gmail.com:465
// Fallback: Resend (RESEND_API_KEY + RESEND_FROM), kept for existing setups.

const PLANNER_URL = (process.env.PLANNER_URL || 'https://frame-frqnc-weekly-planner.vercel.app').replace(/\/+$/, '');

const hasSmtp = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
const hasResend = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
const hasEmail = hasSmtp || hasResend;

const FROM = process.env.EMAIL_FROM || (hasSmtp ? `Frame & Frqnc Planner <${process.env.SMTP_USER}>` : process.env.RESEND_FROM);

let transporter = null;
function getTransporter() {
  if (!transporter) {
    const nodemailer = require('nodemailer');
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderHtml(subject, text) {
  const body = escapeHtml(text).replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:24px">
<tr><td style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6c5ce7;font-weight:bold">Frame &amp; Frqnc · Weekly Planner</td></tr>
<tr><td style="padding-top:8px;font-size:20px;font-weight:bold">${escapeHtml(subject)}</td></tr>
<tr><td style="padding-top:16px;font-size:15px;line-height:1.5">${body}</td></tr>
<tr><td style="padding-top:24px"><a href="${PLANNER_URL}" style="display:inline-block;background:#6c5ce7;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold">Open the planner</a></td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#86868b">You get these because Email alerts are on for you in the planner's Team settings.</td></tr>
</table></td></tr></table></body></html>`;
}

async function sendEmail(to, subject, text) {
  if (!hasEmail) {
    console.warn(`[email] Email is not configured — email not sent to ${to}`);
    return { sent: false, reason: 'not_configured' };
  }
  const fullText = `${text}\n\nOpen the planner: ${PLANNER_URL}`;
  const html = renderHtml(subject, text);

  if (hasSmtp) {
    try {
      await getTransporter().sendMail({ from: FROM, to, subject, text: fullText, html });
      return { sent: true };
    } catch (err) {
      console.error('[email] Google Workspace SMTP delivery failed:', err.message);
      return { sent: false, reason: 'error' };
    }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text: fullText, html }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error('[email] Resend delivery failed:', body.message || response.statusText);
      return { sent: false, reason: 'error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] Delivery failed:', err.message);
    return { sent: false, reason: 'error' };
  }
}

module.exports = { sendEmail, hasEmail, PLANNER_URL };
