'use client';

import { SignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import React from 'react';

export default function SignUpPage() {
  const router = useRouter();

  // Optional: Handle successful sign-up via callback (if needed)
  const handleSuccess = () => {
    router.push('/select-role'); // Redirect to the role selection page after sign-up
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-center mb-6">Create an Account</h2>

        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          afterSignUpUrl="/select-role"  // Redirect user to role selection after signing up
        />
      </div>
    </div>
  );
}
