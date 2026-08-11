// --- WhatsApp notifications via Twilio -------------------------------------
// Configured through TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM
// env vars (set these in the Vercel project settings, or a local .env for dev).
// When they're missing, sends are skipped and logged instead of failing
// whatever request triggered them — a notification hiccup should never break
// the planner itself.

const hasTwilio = Boolean(
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM
);

let client = null;
function getClient() {
  if (!client) {
    const twilio = require('twilio');
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

function toWhatsAppAddress(phone) {
  return phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
}

async function sendWhatsApp(phone, body) {
  if (!phone) return { sent: false, reason: 'no_phone' };
  if (!hasTwilio) {
    console.warn(`[notify] Twilio not configured — message not sent to ${phone}:\n${body}`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const msg = await getClient().messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: toWhatsAppAddress(phone),
      body,
    });
    return { sent: true, sid: msg.sid };
  } catch (err) {
    console.error('[notify] WhatsApp send failed:', err.message);
    return { sent: false, reason: 'error', message: err.message };
  }
}

module.exports = { sendWhatsApp, hasTwilio };
