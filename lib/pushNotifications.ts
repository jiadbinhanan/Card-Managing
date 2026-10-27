import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { supabase } from '@/lib/supabase';

export interface PushAlertPayload {
  title: string;
  body: string;
  inAppTitle?: string;
  inAppBody?: string;
  url?: string;
  type?: 'bill_entry' | 'lent_issue' | 'lent_recovery' | 'rotation_withdraw' | 'qr_cooling' | 'general';
  userIds?: string[];
  data?: Record<string, any>;
}

/**
 * Initializes Push Notifications inside Android Capacitor APK
 * Registers FCM device token with Supabase
 */
export async function initCapacitorPush(
  userId: string,
  onInAppNotification?: (notification: PushNotificationSchema) => void
) {
  if (!Capacitor.isNativePlatform()) {
    // Running in standard web browser - native push not required
    return;
  }

  try {
    // 1. Create Android Notification Channel (for High Priority & Custom Sound)
    await PushNotifications.createChannel({
      id: 'credics_alerts_channel',
      name: 'Credics Alerts',
      description: 'Critical notifications for transactions, loans, and card bills',
      importance: 5, // High / Heads-up
      visibility: 1, // Public on lockscreen
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#10B981',
    });

    // 2. Check and request push notification permissions
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Push notification permission was not granted.');
      return;
    }

    // 3. Register device with FCM
    await PushNotifications.register();

    // 4. Token listener: Save token to Supabase `user_push_tokens` table
    await PushNotifications.removeAllListeners();

    PushNotifications.addListener('registration', async (token: Token) => {
      console.log('FCM Token received:', token.value);
      try {
        await supabase.from('user_push_tokens').upsert(
          {
            user_id: userId,
            fcm_token: token.value,
            device_platform: 'android',
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'fcm_token' }
        );
      } catch (err) {
        console.error('Error saving push token to Supabase:', err);
      }
    });

    PushNotifications.addListener('registrationError', (error: any) => {
      console.error('FCM registration error:', JSON.stringify(error));
    });

    // 5. In-App Notification (When user is actively using the app)
    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log('Push received in foreground:', notification);
        if (onInAppNotification) {
          onInAppNotification(notification);
        }
      }
    );

    // 6. Action Performed (When user taps notification on Lockscreen or System Tray)
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        console.log('Push notification tapped:', action);
        const url = action.notification.data?.url;
        if (url && typeof window !== 'undefined') {
          window.location.href = url;
        }
      }
    );
  } catch (error) {
    console.error('Failed to initialize Capacitor Push:', error);
  }
}

/**
 * Sends a push alert through our backend API
 */
export async function sendPushAlert(payload: PushAlertPayload): Promise<boolean> {
  try {
    const res = await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    return !!result.success;
  } catch (error) {
    console.error('Failed to dispatch push notification:', error);
    return false;
  }
}
