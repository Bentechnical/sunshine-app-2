'use client'; // This marks the file as a client component

import React from 'react';
import { ClerkProvider } from '@clerk/nextjs'
import { Geist, Geist_Mono } from "next/font/google";
import { useEffect } from "react";
import { useRouter } from "next/navigation"; // Import useRouter
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Retrieve the publishable key from environment variables
const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();

  // Redirect to /dashboard when accessing the root URL
  useEffect(() => {
    if (window.location.pathname === "/") {
      router.push("/dashboard");
    }
  }, [router]);

  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
