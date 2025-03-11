'use client';

import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';

export default function SelectRolePage() {
  const { user } = useUser();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState('');
  const [roleError, setRoleError] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // Track loading state
  const [submitError, setSubmitError] = useState<string | null>(null); // Track submit errors

  const handleRoleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRole(event.target.value);
    setRoleError(false); // Reset the error if the role is changed
    setSubmitError(null); // Reset submit error when role is changed
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
  
    if (!selectedRole) {
      setRoleError(true);
      return;
    }
  
    setIsLoading(true);
  
    try {
      const response = await fetch('/api/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user?.id, role: selectedRole }),
      });
  
      if (response.ok) {
        await user?.reload(); // Ensures the latest user metadata is fetched
        router.push('/dashboard');
      } else {
        const errorData = await response.json();
        setSubmitError(errorData.error || 'Error assigning role');
      }
    } catch (error) {
      setSubmitError(`Error occurred: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold text-center mb-6">Select Your Role</h2>

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
              disabled={isLoading} // Disable select while loading
            >
              <option value="">Select Role</option>
              <option value="individual">Individual</option>
              <option value="volunteer">Volunteer</option>
              <option value="admin">Admin</option>
            </select>
            {roleError && <p className="text-red-500 text-sm mt-2">Please select a role.</p>}
          </div>

          {/* Display submit error message */}
          {submitError && <p className="text-red-500 text-sm mt-2">{submitError}</p>}

          <button
            type="submit"
            className="w-full mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg"
            disabled={isLoading} // Disable submit button while loading
          >
            {isLoading ? 'Assigning Role...' : 'Submit'}
          </button>
        </form>
      </div>
    </div>
  );
}
