import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.credics.app',
  appName: 'Credics',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    // প্রোডাকশন লাইভ ওয়েব ডোমেইন থাকলে নিচে কমেন্ট তুলে দিয়ে আপনার ডোমেইন দিন:
    // url: 'https://credics.vercel.app',
    // cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
