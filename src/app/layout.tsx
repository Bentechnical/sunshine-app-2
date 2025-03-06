'use client'; // This marks the file as a client component
import type { Metadata } from 'next'
import React from 'react';
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'
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

const clerkFrontendApi = 'YOUR_FRONTEND_API'; // Replace with your Clerk Frontend API

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
    <ClerkProvider frontendApi={clerkFrontendApi}>
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
