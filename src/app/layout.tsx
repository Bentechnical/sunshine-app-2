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

const clerkFrontendApi = 'https://engaging-spider-65.clerk.accounts.dev'; // Replace with your Clerk Frontend API

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
