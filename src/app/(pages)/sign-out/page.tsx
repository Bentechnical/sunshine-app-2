"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import React from 'react';

export default function SignOutPage() {
  const { signOut } = useClerk();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false); // State for loading state
  const [error, setError] = useState<string | null>(null); // State for error messages

  const handleSignOut = async () => {
    setIsLoading(true); // Set loading to true when sign-out starts
    setError(null); // Clear any previous errors
    try {
      await signOut(); // Perform sign-out
      router.push("/"); // Redirect to home after sign-out
    } catch (error) {
      setError("Error signing out. Please try again."); // Set error if sign-out fails
      console.error("Error signing out:", error); // Log error for debugging
    } finally {
      setIsLoading(false); // Reset loading state after operation completes
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-[100dvh] space-y-4">
      <h2 className="text-xl">Are you sure you want to sign out?</h2>
      <button
        onClick={handleSignOut}
        disabled={isLoading} // Disable the button if loading
        className="px-6 py-3 bg-blue-600 text-white rounded-md disabled:bg-gray-400"
      >
        {isLoading ? "Signing out..." : "Sign Out"}
      </button>
      {error && <p className="text-red-500">{error}</p>} {/* Display error message if any */}
    </div>
  );
}
