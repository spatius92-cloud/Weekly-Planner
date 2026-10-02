const hasEmail = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);

async function sendEmail(to, subject, text) {
  if (!hasEmail) {
    console.warn(`[email] Resend is not configured — email not sent to ${to}`);
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: process.env.RESEND_FROM, to: [to], subject, text }),
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

module.exports = { sendEmail, hasEmail };