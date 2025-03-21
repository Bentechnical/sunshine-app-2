'use client';

import { SignUp, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';

export default function SignUpPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();

  useEffect(() => {
    // Only run once when the user is loaded and exists
    if (isLoaded && user) {
      // Optionally check for a flag to ensure the email is only sent once
      (async () => {
        try {
          const res = await fetch('/api/mailer', {
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
          const result = await res.json();
          console.log('Welcome email sent:', result);
        } catch (error) {
          console.error('Error sending welcome email:', error);
        }
        // Redirect after sending the email
        router.push('/select-role');
      })();
    }
  }, [isLoaded, user, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-center mb-6">Create an Account</h2>
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          afterSignUpUrl="/select-role"
        />
      </div>
    </div>
  );
}
