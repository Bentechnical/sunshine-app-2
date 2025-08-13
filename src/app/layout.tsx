// src/app/layout.tsx
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import StreamChatCleanup from '@/components/layout/StreamChatCleanup';
import OrientationLock from '@/components/layout/OrientationLock';
import ViewportVH from '@/components/layout/ViewportVH';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata = {
  title: 'Sunshine Dogs',
  icons: {
    icon: [
      { url: '/icon0.svg', type: 'image/svg+xml' },
      { url: '/icon1.png', type: 'image/png' },
      { url: '/favicon.ico', type: 'image/x-icon' },
    ],
    shortcut: '/icon0.svg',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <meta name="apple-mobile-web-app-title" content="Sunshine" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
          <meta name="theme-color" content="#ffffff" />
          <meta name="msapplication-TileColor" content="#ffffff" />
          <meta name="msapplication-tap-highlight" content="no" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="apple-touch-icon" href="/web-app-manifest-192x192.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/web-app-manifest-192x192.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/web-app-manifest-192x192.png" />
        </head>
        <body className={`min-h-screen overflow-auto ${geistSans.variable} ${geistMono.variable} antialiased`}>
          <StreamChatCleanup />
          <ViewportVH />
          <OrientationLock />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
