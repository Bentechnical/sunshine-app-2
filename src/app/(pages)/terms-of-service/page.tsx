// src/app/(pages)/terms-of-service/page.tsx
'use client';

export default function TermsOfServicePage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <p className="mb-4">
        Welcome to Sunshine Dogs. By accessing or using our service, you agree to be bound by these Terms of Service. If you do not agree with any part of the terms, you may not use our service.
      </p>
      <h2 className="text-xl font-semibold mt-6 mb-2">1. Use of the Service</h2>
      <p className="mb-4">
        This service is intended to connect individuals with therapy dog volunteers. You may not use the service for any illegal or unauthorized purpose.
      </p>
      <h2 className="text-xl font-semibold mt-6 mb-2">2. User Accounts</h2>
      <p className="mb-4">
        You are responsible for maintaining the confidentiality of your account. Any activity under your account is your responsibility.
      </p>
      <h2 className="text-xl font-semibold mt-6 mb-2">3. Modifications</h2>
      <p className="mb-4">
        We reserve the right to update or change these terms at any time. Continued use of the service constitutes acceptance of those changes.
      </p>
      <p className="text-sm text-gray-500 mt-6">Last updated: June 22, 2025</p>
    </main>
  );
}
