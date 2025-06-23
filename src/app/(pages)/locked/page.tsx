'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LockedPage() {
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const expectedPassword = process.env.NEXT_PUBLIC_SITE_PASSWORD;

    if (passwordInput === expectedPassword) {
      // Set cookie for 1 day
      document.cookie = `access_granted=true; path=/; max-age=86400`;
      router.push('/dashboard'); // ⬅️ now redirects to /dashboard
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white shadow-xl rounded-xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-semibold mb-4 text-center">🔒 Site Locked</h1>
        <p className="text-gray-600 mb-6 text-center">
          This site is currently password protected. Please enter the password to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            placeholder="Enter password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition"
          >
            Unlock
          </button>
        </form>
      </div>
    </main>
  );
}
