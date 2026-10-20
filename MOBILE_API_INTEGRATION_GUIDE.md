# PriceAm Mobile App API Integration Guide

This guide is designed for the mobile development team to test, integrate, and verify every endpoint of the **PriceAm Marketplace**.

---

## 1. Quick Start: Import into Insomnia

1. Open **Insomnia REST Client**.
2. Click **Create** / **Import** (or `Ctrl + Shift + I` / `Cmd + Shift + I`).
3. Select **Import from File**.
4. Choose the file:
   ```text
   PriceAm_API_Collection_Insomnia.json
   ```
5. You will see the entire collection organized into **11 categorized folders** with over 50 endpoints and pre-configured environment variables.

---

## 2. Environment Variables

The Insomnia collection comes with pre-configured variables:

| Variable | Default Value | Description |
|---|---|---|
| `base_url` | `https://95-111-242-169.sslip.io/api/v1` | **Live Production Backend** (SSL Secured) |
| `local_base_url` | `http://localhost:5000/api/v1` | Local backend development server |
| `access_token` | *(populated after login)* | JWT Bearer token for authenticated routes |
| `refresh_token` | *(populated after login)* | Used with `/auth/refresh-token` |
| `admin_token` | *(populated after admin login)* | Bearer token for admin operations |
| `product_id` | *(sample ID)* | Product MongoDB `_id` |
| `offer_id` | *(sample ID)* | Price Am Offer `_id` |
| `order_id` | *(sample ID)* | Order `_id` |
| `conversation_id`| *(sample ID)* | Chat conversation `_id` |

---

## 3. Core Mobile Flows

### A. Authentication & Email OTP Verification
1. **Sign Up:** `POST /auth/register` with `fullName`, `email`, `contactNumber`, `password`.
   - Backend creates account with `emailVerified: false`.
   - Sends a **6-digit OTP** to the user's email (valid for 10 minutes).
2. **Verify OTP:** `POST /auth/verify-email` with `{ email, otp }`.
   - If user didn't get the code: `POST /auth/resend-verification`.
3. **Login:** `POST /auth/login` with `{ email, password }`.
   - Returns `{ accessToken, refreshToken, user }`.
   - Store `accessToken` securely in mobile keychain / encrypted storage.
   - Attach header to protected requests:
     ```http
     Authorization: Bearer <accessToken>
     ```

### B. Instant Seller Store Activation (No KYC)
1. Any registered user can open a store immediately without document verification:
   - `POST /users/seller/apply` with `{ storeName, storeSlug, description }`.
   - Account is granted `seller` role and `approvalStatus: "approved"` instantly.
2. The user can switch active mobile view between Buyer and Seller:
   - `POST /users/switch-role` with `{ role: "buyer" | "seller" }`.

### C. Price Am Negotiation (Bargaining Flow)
1. **Buyer makes offer:** `POST /offers` with `{ productId, offeredPrice, quantity, message }`.
2. **Automated negotiation rules:**
   - If `offeredPrice >= product.minAcceptablePrice`, the system auto-accepts.
   - If `offeredPrice < product.autoDeclinePrice`, the system auto-declines.
   - Otherwise, status is `pending` for seller review.
3. **Seller counter:** `PATCH /offers/:id/counter` with `{ counterPrice, message }`.
4. **Accept offer:** `PATCH /offers/:id/accept`.
5. **Checkout accepted offer:** `PATCH /orders/:id/checkout-offer` with `shippingAddress`.

### D. Direct Messaging & Chat
- Start chat from listing: `POST /chat/products/:productId/conversation`.
- List conversations: `GET /chat/conversations`.
- Send message: `POST /chat/conversations/:id/messages`.
- Unread count badge: `GET /chat/conversations/unread-count`.

---

## 4. Real-time WebSockets (Socket.IO)

The backend provides a Socket.IO gateway on the root server URL (e.g., `http://localhost:5000` or production URL).

### Connection Setup:
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: accessToken },
  transports: ['websocket']
});
```

### Key Events:
| Event Name | Direction | Payload | Description |
|---|---|---|---|
| `join_conversation` | Client -> Server | `conversationId` | Join room for active chat screen |
| `leave_conversation`| Client -> Server | `conversationId` | Leave room when navigating away |
| `new_message` | Server -> Client | Message Object | New incoming chat message |
| `new_offer` | Server -> Client | Offer Object | Instant alert for new Price Am offer |
| `offer_updated` | Server -> Client | Offer Object | Counter, accepted, or rejected offer alert |
| `order_status_updated` | Server -> Client | Order Object | Real-time delivery status change |

---

## 5. Standard API Response Structure

### Success Response:
```json
{
  "message": "Action completed successfully",
  "data": { ... }
}
```

### Validation Error (422 Unprocessable Entity):
```json
{
  "message": "Please fix the highlighted fields and try again",
  "errors": [
    {
      "field": "contactNumber",
      "message": "Please provide a valid phone number"
    }
  ]
}
```

### Error Response (400 / 401 / 403 / 404 / 409):
```json
{
  "message": "Specific error description"
}
```

---

## 6. Firebase Cloud Messaging (FCM) Push Notifications

The backend uses Firebase Admin SDK with project `banjo-app-bf0ed` to dispatch background push notifications to iOS and Android devices.

### A. Register Device Token (Call immediately after user logs in or token refreshes)
* **Endpoint:** `POST /api/v1/notifications/fcm-token`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Body:**
```json
{
  "token": "fcm_device_token_from_firebase_sdk",
  "platform": "android",
  "deviceId": "optional_hardware_uuid"
}
```
* **Response (200 OK):**
```json
{
  "message": "FCM device token registered successfully",
  "tokensCount": 1
}
```

### B. Unregister Device Token (Call on Logout)
* **Endpoint:** `DELETE /api/v1/notifications/fcm-token`
* **Headers:** `Authorization: Bearer <accessToken>`
* **Body:**
```json
{
  "token": "fcm_device_token_from_firebase_sdk"
}
```

### C. List In-App Notifications Feed
* **Endpoint:** `GET /api/v1/notifications?page=1&limit=20`
* **Response (200 OK):**
```json
{
  "notifications": [
    {
      "_id": "...",
      "title": "New Price Am Offer: ₦35,000",
      "body": "You received a new offer of ₦35,000 on iPhone 13 Pro",
      "type": "offer_received",
      "data": { "type": "offer", "offerId": "...", "productId": "..." },
      "isRead": false,
      "createdAt": "2026-10-20T14:30:00.000Z"
    }
  ],
  "total": 1,
  "unreadCount": 1,
  "page": 1,
  "pages": 1
}
```

### D. Mark Notifications Read
* **Mark Single:** `PATCH /api/v1/notifications/:id/read`
* **Mark All:** `PATCH /api/v1/notifications/read-all`

### E. Test Push Notification
* **Endpoint:** `POST /api/v1/notifications/test`
* **Body (Optional):**
```json
{
  "title": "Test Push Notification",
  "body": "Testing FCM push alerts from PriceAm server!"
}
```

### F. Automated Push Notification Triggers & Payloads (P2P Deal Model)

| Trigger Event | Recipient | Notification Title | Data Payload (`data` dictionary) | Action on Tap |
|---|---|---|---|---|
| **Chat Message** | Buyer or Seller | `Message from {Sender}` | `{ type: "chat", conversationId: "...", senderId: "...", messageId: "..." }` | Open chat screen with `conversationId` |
| **New Price Am Offer** | Seller | `New Price Am Offer: ₦{Price}` | `{ type: "offer", action: "submitted", offerId: "...", productId: "..." }` | Open Offers / Offer Detail |
| **Offer Countered** | Buyer or Seller | `Counter Offer: ₦{Price}` | `{ type: "offer", action: "countered", offerId: "...", productId: "..." }` | Open Offer Detail |
| **Offer Accepted** | Buyer or Seller | `Offer Accepted! 🎉` | `{ type: "offer", action: "accepted", offerId: "...", productId: "...", orderId: "..." }` | Open Deal Hub (`orderId`) |
| **Offer Declined** | Buyer or Seller | `Offer Declined` | `{ type: "offer", action: "rejected", offerId: "...", productId: "..." }` | Open Offers screen |
| **New Deal Created** | Seller | `New Deal in Progress! 🛍️` | `{ type: "order", orderId: "..." }` | Open Deal Hub (`orderId`) |
| **Deal Initiated** | Buyer | `Deal Initiated! 📦` | `{ type: "order", orderId: "..." }` | Open Deal Hub (`orderId`) |
| **Deal Handover Confirmed**| Buyer or Seller | `Deal Completed! 🎉` | `{ type: "order", orderId: "...", status: "completed" }` | Open Deal Hub (Leave review) |

---

## 7. Mobile Developer Implementation Guide (Flutter & React Native)

### Step 1: Firebase Project Configuration
The backend is authenticated to Google Firebase project:
* **Firebase Project ID:** `banjo-app-bf0ed`
* **Service Account:** `firebase-adminsdk-fbsvc@banjo-app-bf0ed.iam.gserviceaccount.com`

> [!IMPORTANT]
> The mobile developer must register their mobile apps (iOS Bundle ID & Android Package Name) in this **exact same Firebase Project** (`banjo-app-bf0ed`) at [console.firebase.google.com](https://console.firebase.google.com):
> * **Android:** Download `google-services.json` and place in `android/app/`
> * **iOS:** Download `GoogleService-Info.plist` and add via Xcode to the runner project

---

### Step 2: Implementation in Flutter (`firebase_messaging`)

#### 1. Add Dependencies (`pubspec.yaml`):
```yaml
dependencies:
  firebase_core: ^3.0.0
  firebase_messaging: ^15.0.0
  flutter_local_notifications: ^17.0.0 # optional, for heads-up alerts while in foreground
```

#### 2. Request Permission & Sync Device Token:
```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:io';

class PushNotificationService {
  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  static const String baseUrl = 'https://pricem.vercel.app/api/v1'; // or backend API URL

  Future<void> initPushNotifications(String userAuthToken) async {
    // 1. Request OS permission (iOS & Android 13+)
    NotificationSettings settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      // 2. Fetch the FCM device registration token
      String? token = await _fcm.getToken();
      if (token != null) {
        await _registerTokenWithBackend(token, userAuthToken);
      }

      // 3. Listen for token refreshes
      _fcm.onTokenRefresh.listen((newToken) {
        _registerTokenWithBackend(newToken, userAuthToken);
      });

      // 4. Handle Notification click when app is opened from Background
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        _handleDeepLink(message.data);
      });

      // 5. Handle Notification click when app is launched from Terminated state
      RemoteMessage? initialMessage = await _fcm.getInitialMessage();
      if (initialMessage != null) {
        _handleDeepLink(initialMessage.data);
      }
    }
  }

  // Send token to PriceAm Backend
  Future<void> _registerTokenWithBackend(String token, String authToken) async {
    final response = await http.post(
      Uri.parse('$baseUrl/notifications/fcm-token'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $authToken',
      },
      body: jsonEncode({
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
      }),
    );
    print('FCM Token sync status: ${response.statusCode}');
  }

  // Remove token when user logs out
  Future<void> unregisterOnLogout(String authToken) async {
    String? token = await _fcm.getToken();
    if (token != null) {
      await http.delete(
        Uri.parse('$baseUrl/notifications/fcm-token'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $authToken',
        },
        body: jsonEncode({'token': token}),
      );
    }
  }

  // Handle routing based on backend payload
  void _handleDeepLink(Map<String, dynamic> data) {
    final type = data['type'];
    if (type == 'chat') {
      final conversationId = data['conversationId'];
      // Navigator.pushNamed(context, '/chat', arguments: conversationId);
    } else if (type == 'offer') {
      final offerId = data['offerId'];
      // Navigator.pushNamed(context, '/offers', arguments: offerId);
    } else if (type == 'order') {
      final orderId = data['orderId'];
      // Navigator.pushNamed(context, '/order-hub', arguments: orderId);
    }
  }
}
```

---

### Step 3: Implementation in React Native (`@react-native-firebase/messaging`)

#### 1. Add Dependencies:
```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
```

#### 2. Push Notification Manager (`NotificationManager.ts`):
```typescript
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

const API_BASE_URL = 'https://pricem.vercel.app/api/v1';

export class NotificationManager {
  static async requestUserPermission(authToken: string) {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      // 1. Get Device Token
      const token = await messaging().getToken();
      if (token) {
        await this.registerTokenWithBackend(token, authToken);
      }

      // 2. Listen for Token Rotations
      messaging().onTokenRefresh(async (newToken) => {
        await this.registerTokenWithBackend(newToken, authToken);
      });

      // 3. App opened from background state via push notification click
      messaging().onNotificationOpenedApp((remoteMessage) => {
        if (remoteMessage?.data) {
          this.handleNotificationNavigation(remoteMessage.data);
        }
      });

      // 4. App opened from completely closed (terminated) state
      messaging()
        .getInitialNotification()
        .then((remoteMessage) => {
          if (remoteMessage?.data) {
            this.handleNotificationNavigation(remoteMessage.data);
          }
        });
    }
  }

  // Register device token with PriceAm backend
  static async registerTokenWithBackend(token: string, authToken: string) {
    try {
      await fetch(`${API_BASE_URL}/notifications/fcm-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          token,
          platform: Platform.OS, // 'ios' or 'android'
        }),
      });
    } catch (err) {
      console.error('Failed to register FCM token with backend:', err);
    }
  }

  // Remove device token on user logout
  static async unregisterOnLogout(authToken: string) {
    try {
      const token = await messaging().getToken();
      if (token) {
        await fetch(`${API_BASE_URL}/notifications/fcm-token`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token }),
        });
      }
    } catch (err) {
      console.error('Failed to unregister FCM token:', err);
    }
  }

  // Route deep links according to event type
  static handleNotificationNavigation(data: Record<string, any>) {
    switch (data.type) {
      case 'chat':
        // navigation.navigate('ChatScreen', { conversationId: data.conversationId });
        break;
      case 'offer':
        // navigation.navigate('OfferDetailScreen', { offerId: data.offerId });
        break;
      case 'order':
        // navigation.navigate('DealHubScreen', { orderId: data.orderId });
        break;
    }
  }
}
```

---

### Step 4: Checklist for the Mobile Developer

* [ ] **Firebase Console**: Ensure iOS Bundle Identifier and Android Package Name are registered in Firebase Project **`banjo-app-bf0ed`**.
* [ ] **Config Files**:
  * Download `google-services.json` ➔ place in `android/app/`.
  * Download `GoogleService-Info.plist` ➔ import into Xcode (Runner target).
* [ ] **iOS APNs Setup**:
  * Upload the Apple Push Notification service (APNs) Auth Key (`.p8`) to Firebase Console under **Project Settings ➔ Cloud Messaging ➔ Apple app configuration**.
  * Enable **Push Notifications** and **Background Modes (Remote notifications)** in Xcode project capabilities.
* [ ] **On Login / Launch**: Request permissions, grab FCM token, and send to `POST /api/v1/notifications/fcm-token`.
* [ ] **On Logout**: Call `DELETE /api/v1/notifications/fcm-token` with the device token so subsequent users on the same phone don't receive private alerts.
* [ ] **Deep Linking**: Inspect `data.type` (`chat`, `offer`, `order`) to navigate directly to the relevant screen when tapped.
