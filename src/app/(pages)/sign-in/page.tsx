'use client';

import { useSignIn, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { OAuthStrategy } from '@clerk/types';

export default function CustomSignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSignedIn) {
      router.replace('/dashboard');
    }
  }, [isSignedIn, router]);

  const handleGoogleSignIn = async () => {
    if (!signIn) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google' as OAuthStrategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/dashboard',
      });
    } catch (err: any) {
      console.error('OAuth sign-in error:', err.errors || err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setError('');

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.push('/dashboard');
      } else {
        console.log('Sign-in requires additional steps:', result);
      }
    } catch (err: any) {
      const message = err.errors?.[0]?.message || 'Something went wrong.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#e3f0f1] px-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-md p-8">
        <div className="w-full mb-6 text-center">
          <img
            src="/images/sunshine-logo-color.png"
            alt="Sunshine Therapy Dogs Logo"
            className="mx-auto max-w-[240px] h-auto object-contain"
          />
        </div>

        <h2 className="text-2xl font-bold text-center text-[#0e62ae] mb-2">Sign In</h2>
        <p className="text-sm text-center text-gray-600 mb-6">
          Choose a sign-in method below
        </p>

        <div className="mb-6">
          <Button
            variant="outline"
            className="w-full flex items-center gap-2 justify-center"
            onClick={handleGoogleSignIn}
          >
            <img src="/icons/google.svg" className="w-5 h-5" alt="Google icon" />
            Sign in with Google
          </Button>
        </div>

        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <span className="relative bg-white px-3 text-sm text-gray-500">
            or sign in with email
          </span>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="text-right">
              <Link
                href="/sign-in/forgot-password"
                className="text-sm text-[#0e62ae] hover:text-[#094f91] underline"
              >
                Forgot your password?
              </Link>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button
            type="submit"
            className="w-full bg-[#0e62ae] hover:bg-[#095397] text-white"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
          </Button>
        </form>

        <p className="text-md text-center text-gray-700 mt-6">
          Don’t have an account?{' '}
          <Link
            href="/sign-up"
            className="text-[#0e62ae] font-semibold underline hover:text-[#094f91]"
          >
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
