'use client'; // This marks the file as a client component

import { useClerk, useUser } from '@clerk/clerk-react'; // Import Clerk hooks
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AdminDashboard = () => {
  const { isLoaded, user } = useUser(); // Get Clerk user data

  
  const { signOut } = useClerk(); // Use signOut from useClerk hook
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isLoading, setIsLoading] = useState(false); // Loading state for sign-out
  const [error, setError] = useState<string | null>(null); // Error state
  const router = useRouter();

  // UseEffect to make sure the user data is fully loaded
  useEffect(() => {
    if (isLoaded && !user) {
      // This case handles if the user isn't signed in
      console.log("User is not signed in");
    }
  }, [isLoaded, user]);
  

  const handleSignOut = async () => {
    setIsLoading(true); // Set loading to true when sign-out starts
    setError(null); // Clear any previous errors
    try {
      await signOut(); // Perform sign-out
      router.push('/sign-in'); // Redirect to sign-in page after sign-out
    } catch (error) {
      setError("Error signing out. Please try again.");
      console.error("Error signing out:", error); // Log error for debugging
    } finally {
      setIsLoading(false); // Reset loading state after operation completes
    }
  };


  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-4">Loading...</h2>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <h2 className="text-3xl font-semibold text-gray-800 mb-4">You are not logged in</h2>
          <p className="text-gray-600">Please log in to proceed</p>
          <button
            onClick={() => window.location.href = '/sign-in'}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 text-white p-5 space-y-6 flex flex-col justify-between">
        <div>
          <h2 className="text-xl font-bold">Admin Dashboard</h2>
          <div>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'dashboard' ? 'bg-gray-600' : ''}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'sessions' ? 'bg-gray-600' : ''}`}
            >
              Sessions
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'users' ? 'bg-gray-600' : ''}`}
            >
              Users
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full py-2 text-left px-4 rounded-md ${activeTab === 'settings' ? 'bg-gray-600' : ''}`}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Sign-out Button */}
        <div className="mt-6">
          <button
            onClick={handleSignOut}
            disabled={isLoading} // Disable the button if loading
            className="w-full py-2 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 transition duration-200 disabled:bg-gray-400"
          >
            {isLoading ? 'Signing out...' : 'Sign Out'}
          </button>
          {error && <p className="text-red-500 mt-2">{error}</p>} {/* Display error message if any */}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 bg-gray-100">
        <h2 className="text-3xl font-semibold mb-6">Admin Dashboard</h2>

        {/* User Information */}
        <div className="bg-white shadow-lg rounded-lg p-5 mb-6">
          <h3 className="text-xl font-semibold mb-4">Logged in as:</h3>
          {/* Ensure user.emailAddresses is available */}
          {user ? (
            <>
              <p className="text-lg text-gray-700">
                {user.firstName || 'First name not available'} {user.lastName || 'Last name not available'}
              </p>
              <p className="text-lg text-gray-700">
                {user.emailAddresses?.[0]?.emailAddress || 'Email not available'}
              </p>
              <p className="text-lg text-gray-700">
                Role: {user.publicMetadata?.role || 'No role assigned'}
              </p>
            </>
          ) : (
            <p className="text-lg text-gray-700">User information not available</p>
          )}
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          {['Total Users', 'Total Sessions', 'Pending Verifications', 'Notifications'].map((stat, index) => (
            <div key={index} className="bg-white shadow-lg rounded-lg p-5">
              <h3 className="text-lg font-medium">{stat}</h3>
              <p className="text-3xl font-bold">{Math.floor(Math.random() * 1000)}</p>
            </div>
          ))}
        </div>

        {/* Placeholder Data Notice */}
        <div className="bg-gray-200 p-4 rounded-lg mb-6 text-center text-gray-700">
          <p><strong>Note:</strong> The data shown above (total users, sessions, etc.) is just placeholder data and is not real.</p>
        </div>

        {/* Recent Activities */}
        <div className="bg-white shadow-lg rounded-lg p-5">
          <h3 className="text-xl font-semibold mb-4">Recent Activities</h3>
          <ul className="space-y-3">
            {[
              'New user "Jane Doe" signed up.',
              'Session #342 was successfully completed.',
              'Dog "Max" has been verified.',
            ].map((activity, index) => (
              <li key={index} className="text-gray-600">{activity}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
