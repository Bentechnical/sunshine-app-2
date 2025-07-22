'use client';

import { SignUp, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';

export default function SignUpPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded && user) {
      (async () => {
        try {
          await fetch('/api/mailer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: user.primaryEmailAddress?.emailAddress,
              subject: 'Welcome to Sunshine App!',
              templateName: 'welcome',
              data: {
                name: user.firstName,
                year: new Date().getFullYear(),
              },
            }),
          });
        } catch (error) {
          console.error('Error sending welcome email:', error);
        }
        router.push('/complete-profile');
      })();
    }
  }, [isLoaded, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#e3f0f1] px-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-md p-8">
        <div className="w-full mb-6 text-center">
          <img
            src="/images/sunshine-logo-color.png"
            alt="Sunshine Therapy Dogs Logo"
            className="mx-auto max-w-[240px] h-auto object-contain"
          />
        </div>
        <div className="clerk-custom-signup">
          <SignUp
            path="/sign-up"
            routing="path"
            signInUrl="/sign-in"
            forceRedirectUrl="/complete-profile"
            appearance={{
              elements: {
                card: 'shadow-none px-0 py-0',
                formButtonPrimary: 'bg-[#0e62ae] hover:bg-[#095397] text-white',
                headerTitle: 'text-xl font-bold text-center text-[#0e62ae]',
                headerSubtitle: 'text-sm text-gray-600 text-center mb-4',
                formFieldInput: 'input input-bordered w-full',
                formFieldLabel: 'text-sm text-gray-700 mb-1',
                footerActionText: 'text-gray-700 text-sm text-center',
                footerActionLink: 'text-[#0e62ae] font-semibold hover:text-[#094f91] underline',
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
