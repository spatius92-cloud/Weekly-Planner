// --- Browser push notifications (Web Push) ---------------------------------
// Unlike WhatsApp/email this needs no third-party account: VAPID_PUBLIC_KEY /
// VAPID_PRIVATE_KEY are a keypair generated once for this app, used to talk
// directly to each browser's own push service. A device "subscribes" from
// the browser (see public/app.js + public/sw.js); we push to it from here.

const webpush = require('web-push');

const hasVapid = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const hasFirebase = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

if (hasVapid) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:no-reply@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// subscription: { endpoint, keys: { p256dh, auth } } (a browser PushSubscription, JSON-ified)
async function sendPush(subscription, payload) {
  if (subscription.platform === 'android' && subscription.token) {
    if (!hasFirebase) {
      console.warn(`[push] Firebase credentials not configured — notification not sent: ${payload.title}`);
      return { sent: false, reason: 'not_configured' };
    }
    try {
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
        });
      }
      await admin.messaging().send({
        token: subscription.token,
        notification: { title: payload.title, body: payload.body },
        data: { tag: payload.tag || 'planner-update' },
        android: {
          priority: 'high',
          notification: { channelId: 'planner-updates-v3', sound: 'planner_notification' },
        },
        apns: {
          payload: { aps: { sound: 'planner_notification.wav' } },
        },
      });
      return { sent: true };
    } catch (err) {
      const expired = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(err.code);
      if (!expired) console.error('[push] Firebase send failed:', err.message);
      return { sent: false, reason: expired ? 'expired' : 'error', message: err.message, expired };
    }
  }

  if (!hasVapid) {
    console.warn(`[push] VAPID keys not configured — notification not sent: ${payload.title}`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { sent: true };
  } catch (err) {
    // 404/410 means the subscription is dead (browser data cleared, permission revoked, uninstalled, …).
    const expired = err.statusCode === 404 || err.statusCode === 410;
    if (!expired) console.error('[push] Send failed:', err.message);
    return { sent: false, reason: expired ? 'expired' : 'error', message: err.message, expired };
  }
}

module.exports = { sendPush, hasVapid, hasFirebase };
