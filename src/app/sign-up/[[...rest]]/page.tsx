"use client";

import { SignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignUpPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState(""); // Track selected role
  const [isSubmitting, setIsSubmitting] = useState(false); // Track submission state
  const [roleError, setRoleError] = useState(false); // Track role error state

  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRole(event.target.value); // Update selected role
    setRoleError(false); // Reset error when the user changes the role
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // If no role is selected, show error
    if (!selectedRole) {
      setRoleError(true);
      return;
    }

    setIsSubmitting(true); // Start the submission process

    try {
      // Call the API to assign the role
      const response = await fetch("/api/assignRole", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: selectedRole,
        }),
      });

      if (response.ok) {
        // Once the role is successfully assigned, trigger sign-up
        router.push("/dashboard"); // Redirect to dashboard
      } else {
        console.error("Error assigning role");
      }
    } catch (error) {
      console.error("Error occurred during sign-up:", error);
    } finally {
      setIsSubmitting(false); // End the submission process
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-center mb-6">Sign Up</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="role" className="block text-sm font-semibold text-gray-700 mb-2">
              Select your role
            </label>
            <select
              id="role"
              value={selectedRole}
              onChange={handleRoleChange}
              className={`w-full px-4 py-2 border rounded-lg text-gray-700 ${roleError ? 'border-red-500' : 'border-gray-300'}`}
            >
              <option value="">Select Role</option>
              <option value="individual">Individual</option>
              <option value="volunteer">Volunteer</option>
              <option value="admin">Admin</option>
            </select>
            {roleError && <p className="text-red-500 text-sm mt-2">Please select a role.</p>}
          </div>

          {/* Sign-Up Form */}
          <SignUp
            path="/sign-up"
            routing="path"
            signInUrl="/sign-in"
            afterSignUpUrl="/dashboard" // Redirect after sign-up
          />

          <button
            type="submit"
            className="w-full mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg"
            disabled={!selectedRole || isSubmitting} // Disable while submitting
          >
            Sign Up
          </button>
        </form>
      </div>
    </div>
  );
}
