import { Platform, Linking, Alert } from 'react-native';

/**
 * Android "Display Over Other Apps" (SYSTEM_ALERT_WINDOW) Helper
 * 
 * In Android 10-17, apps require explicit user consent via the system settings
 * to draw overlays or urgent bottom sheets while the user is outside the app.
 */

export async function requestOverlayPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;

  Alert.alert(
    'Enable Emergency Bill Alerts',
    'To notify you on screen even when using other apps when a bill is due in 24 hours, Credics needs "Display over other apps" permission.',
    [
      {
        text: 'Later',
        style: 'cancel',
      },
      {
        text: 'Open Settings',
        onPress: async () => {
          try {
            // Opens the Android System "Appear on top" / Overlay permission page directly for Credics
            await Linking.openSettings();
          } catch (err) {
            console.error('Failed to open overlay settings:', err);
          }
        },
      },
    ]
  );
}

export function isOverlaySupported(): boolean {
  return Platform.OS === 'android';
}
