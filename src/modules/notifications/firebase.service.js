import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import User from '../users/user.model.js';
import Notification from './notification.model.js';
import { emitToUser } from '../../config/socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseApp = null;
let isInitialized = false;

export function initFirebase() {
  if (isInitialized && firebaseApp) return firebaseApp;

  try {
    const candidatePaths = [
      process.env.FIREBASE_CONFIG_PATH,
      path.resolve(process.cwd(), 'firebase-sdk.json'),
      path.resolve(process.cwd(), 'Backend/firebase-sdk.json'),
      path.resolve(__dirname, '../../../firebase-sdk.json'),
    ].filter(Boolean);

    const configPath = candidatePaths.find((p) => fs.existsSync(p));

    if (!configPath) {
      console.warn('[Firebase] Warning: firebase-sdk.json not found in candidate paths. Push notifications disabled.');
      return null;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!getApps().length) {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      firebaseApp = getApp();
    }

    isInitialized = true;
    console.log(`[Firebase] Initialized successfully for project: ${serviceAccount.project_id}`);
    return firebaseApp;
  } catch (err) {
    console.error('[Firebase] Error initializing Firebase Admin SDK:', err.message);
    return null;
  }
}

// Auto-initialize on module load
initFirebase();

/**
 * Register or update an FCM token for a user.
 */
export async function registerFcmToken(userId, { token, platform = 'unknown', deviceId }) {
  if (!token || typeof token !== 'string') {
    throw new Error('Valid FCM token is required');
  }

  const cleanToken = token.trim();
  const user = await User.findById(userId);
  if (!user) return null;

  user.fcmTokens = user.fcmTokens || [];
  const existingIdx = user.fcmTokens.findIndex((item) => item.token === cleanToken);

  if (existingIdx >= 0) {
    user.fcmTokens[existingIdx].platform = platform;
    if (deviceId) user.fcmTokens[existingIdx].deviceId = deviceId;
    user.fcmTokens[existingIdx].updatedAt = new Date();
  } else {
    // Keep max 10 active tokens per user
    if (user.fcmTokens.length >= 10) {
      user.fcmTokens.shift();
    }
    user.fcmTokens.push({
      token: cleanToken,
      platform,
      deviceId,
      updatedAt: new Date(),
    });
  }

  await user.save();
  return user.fcmTokens;
}

/**
 * Remove an FCM token (e.g., user logged out of a device).
 */
export async function removeFcmToken(userId, token) {
  if (!token) return;
  await User.updateOne(
    { _id: userId },
    { $pull: { fcmTokens: { token: token.trim() } } }
  );
}

/**
 * Clean up invalid / unregistered tokens from DB.
 */
async function purgeInvalidTokens(userId, invalidTokens) {
  if (!invalidTokens || invalidTokens.length === 0) return;
  try {
    await User.updateOne(
      { _id: userId },
      { $pull: { fcmTokens: { token: { $in: invalidTokens } } } }
    );
  } catch (err) {
    console.warn('[Firebase] Could not purge invalid tokens:', err.message);
  }
}

/**
 * Convert any arbitrary data object to a string-keyed string-valued map required by FCM.
 */
function sanitizeDataPayload(data = {}) {
  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) {
      result[String(key)] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }
  }
  return result;
}

/**
 * Send push notification to a list of device tokens.
 */
export async function sendPushNotification({ tokens = [], title, body, data = {}, imageUrl }) {
  if (!tokens || tokens.length === 0) return { successCount: 0, failureCount: 0 };
  if (!isInitialized) initFirebase();
  if (!isInitialized || !firebaseApp) return { successCount: 0, failureCount: tokens.length };

  const sanitizedData = sanitizeDataPayload(data);

  const message = {
    tokens,
    notification: {
      title,
      body,
      ...(imageUrl ? { imageUrl } : {}),
    },
    data: sanitizedData,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'priceam_alerts',
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        ...(imageUrl ? { imageUrl } : {}),
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
      fcmOptions: imageUrl ? { imageUrl } : undefined,
    },
  };

  try {
    const messaging = getMessaging(firebaseApp);
    const response = await messaging.sendEachForMulticast(message);
    const invalidTokens = [];

    response.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error) {
        const code = resp.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens,
    };
  } catch (err) {
    console.error('[Firebase] Failed to send multicast message:', err.message);
    return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
  }
}

/**
 * High-level helper:
 * 1. Creates an in-app Notification record in DB.
 * 2. Emits a real-time event to active websockets.
 * 3. Delivers a Firebase push notification to all user's registered devices.
 */
export async function sendNotificationToUser(userId, { title, body, type = 'system', data = {}, imageUrl }) {
  try {
    const user = await User.findById(userId).select('fcmTokens fullName').lean();
    if (!user) return null;

    // 1. Save in-app notification document
    const notificationDoc = await Notification.create({
      user: userId,
      title,
      body,
      type,
      data: sanitizeDataPayload(data),
    });

    // 2. Real-time socket delivery
    emitToUser(userId, 'notification:new', notificationDoc);
    emitToUser(userId, 'badges:changed', { reason: 'notification' });

    // 3. FCM Push delivery if device tokens exist
    const tokens = (user.fcmTokens || []).map((t) => t.token).filter(Boolean);
    if (tokens.length > 0) {
      const result = await sendPushNotification({
        tokens,
        title,
        body,
        data: {
          ...data,
          notificationId: String(notificationDoc._id),
          type,
        },
        imageUrl,
      });

      if (result.invalidTokens && result.invalidTokens.length > 0) {
        await purgeInvalidTokens(userId, result.invalidTokens);
      }
    }

    return notificationDoc;
  } catch (err) {
    console.error('[Notification] Error delivering notification to user:', err.message);
    return null;
  }
}

/**
 * Send notification to multiple users simultaneously.
 */
export async function sendNotificationToUsers(userIds = [], payload) {
  return Promise.all(userIds.map((id) => sendNotificationToUser(id, payload)));
}
