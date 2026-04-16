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
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#e3f0f1] px-4 py-8">
      <img
        src="/images/sunshine-logo-color.png"
        alt="Sunshine Therapy Dogs Logo"
        className="mb-4 max-w-[160px] h-auto object-contain"
      />
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        forceRedirectUrl="/complete-profile"
        appearance={{
          variables: {
            colorBackground: '#ffffff',
            colorInputBackground: '#ffffff',
            colorPrimary: '#0e62ae',
          },
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'shadow-md rounded-2xl w-full',
            headerTitle: 'text-xl font-bold text-center text-[#0e62ae]',
            headerSubtitle: 'text-sm text-gray-600 text-center',
            formButtonPrimary: 'bg-[#0e62ae] hover:bg-[#095397] text-white',
            formFieldLabel: 'text-sm text-gray-700',
            footerActionText: 'text-gray-700 text-sm text-center',
            footerActionLink: 'text-[#0e62ae] font-semibold hover:text-[#094f91] underline',
          },
        }}
      />
    </div>
  );
}
