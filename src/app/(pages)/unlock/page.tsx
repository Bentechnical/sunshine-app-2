// src/app/unlock/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UnlockPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        // Dev-only client cookie set to ensure immediate visibility to middleware on iOS Simulator
        if (process.env.NODE_ENV !== 'production') {
          try {
            document.cookie = 'access_granted=true; Path=/; SameSite=Lax';
          } catch {}
        }
        
        // For ngrok requests, use router.push to avoid full page reload
        // This prevents the middleware from re-running and redirecting back
        if (window.location.hostname.includes('ngrok')) {
          router.push('/');
        } else {
          // Slight delay to ensure cookie commit before navigation (Safari/iOS)
          setTimeout(() => {
            window.location.replace('/');
          }, 150);
        }
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid password.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSubmitting) {
      handleSubmit(e as any);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gray-100 px-4">
      <form onSubmit={handleSubmit} className="bg-white shadow-lg p-6 rounded-lg max-w-sm w-full">
        <h2 className="text-xl font-semibold mb-4">Enter Access Password</h2>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full border px-3 py-2 rounded mb-3"
          placeholder="Password"
          disabled={isSubmitting}
          autoFocus
        />
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Unlocking...' : 'Unlock'}
        </button>
      </form>
    </div>
  );
}
