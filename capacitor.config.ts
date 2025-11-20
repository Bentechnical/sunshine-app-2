import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sunshinetherapydogs.app',
  appName: 'Sunshine Therapy Dogs',
  webDir: 'dist', // fallback assets only; real app served remotely
  server: {
    url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://sunshinedogs.app',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
