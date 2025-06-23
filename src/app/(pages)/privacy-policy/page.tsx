// src/app/(pages)/privacy-policy/page.tsx
'use client';

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="mb-4">
        Sunshine Dogs respects your privacy. This policy explains how we handle your information when you use our service.
      </p>
      <h2 className="text-xl font-semibold mt-6 mb-2">1. Information We Collect</h2>
      <p className="mb-4">
        We collect only the minimum information necessary to operate the service, including your name, email address, and role within the app. We do not share your data with third parties.
      </p>
      <h2 className="text-xl font-semibold mt-6 mb-2">2. How We Use Your Data</h2>
      <p className="mb-4">
        Your information is used solely to facilitate therapy dog appointments and related features. We do not use your data for advertising.
      </p>
      <h2 className="text-xl font-semibold mt-6 mb-2">3. Data Security</h2>
      <p className="mb-4">
        We use modern authentication and data storage practices to protect your data. However, no online system is 100% secure.
      </p>
      <h2 className="text-xl font-semibold mt-6 mb-2">4. Contact</h2>
      <p className="mb-4">
        If you have any questions about this Privacy Policy, please contact us at support@sunshinedogs.app.
      </p>
      <p className="text-sm text-gray-500 mt-6">Last updated: June 22, 2025</p>
    </main>
  );
}
