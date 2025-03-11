"use client";

import { SignIn } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import React from 'react';

export default function SignInPage() {

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-center mb-6">Sign In</h2>
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          afterSignInUrl="/dashboard" // Redirect after sign-in, adjust accordingly
        />
      </div>
    </div>
  );
}
