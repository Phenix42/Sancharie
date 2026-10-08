const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidKeysLookValid = /^[A-Za-z0-9_-]{80,100}$/.test(publicKey) && /^[A-Za-z0-9_-]{40,60}$/.test(privateKey);
if (vapidKeysLookValid) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@sancharie.com', publicKey, privateKey);
}

const isConfigured = () => vapidKeysLookValid;
const sendToSubscription = async (subscription, payload) => {
  if (!isConfigured()) return false;
  try {
    await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify(payload), { TTL: 60 * 60 });
    return true;
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 410) await PushSubscription.deleteOne({ _id: subscription._id });
    return false;
  }
};

const sendUserNotification = async (userId, payload) => {
  if (!isConfigured()) return 0;
  const subscriptions = await PushSubscription.find({ userId }).lean();
  const results = await Promise.all(subscriptions.map((subscription) => sendToSubscription(subscription, payload)));
  return results.filter(Boolean).length;
};

const sendCampaign = async (payload) => {
  if (!isConfigured()) return { sent: 0, failed: 0 };
  const subscriptions = await PushSubscription.find().lean();
  const results = await Promise.all(subscriptions.map((subscription) => sendToSubscription(subscription, payload)));
  return { sent: results.filter(Boolean).length, failed: results.filter((sent) => !sent).length };
};

module.exports = { publicKey, isConfigured, sendUserNotification, sendCampaign };
