//src/app/layout.tsx

'use client';

import React, { useEffect } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { Geist, Geist_Mono } from 'next/font/google';
import { useRouter } from 'next/navigation';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Missing Clerk publishable key. Please set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in your environment variables.');
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();

  useEffect(() => {
    if (window.location.pathname === '/') {
      router.push('/dashboard');
    }
  }, [router]);

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <html lang="en">
        <body className={`min-h-screen overflow-auto ${geistSans.variable} ${geistMono.variable} antialiased`}>

          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
