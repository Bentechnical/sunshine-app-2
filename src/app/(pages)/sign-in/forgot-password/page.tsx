'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSignIn, useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'request' | 'verify'>('request');

  useEffect(() => {
    if (isSignedIn) {
      router.replace('/dashboard');
    }
  }, [isSignedIn, router]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    setError(null);

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      setStep('verify');
    } catch (err: any) {
      const message = err?.errors?.[0]?.message || 'Unable to send reset code.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    setError(null);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password,
      });

      if (result.status === 'complete') {
        // If a session was created, activate it; otherwise, send back to sign-in
        if (result.createdSessionId && setActive) {
          await setActive({ session: result.createdSessionId });
          router.replace('/dashboard');
        } else {
          router.replace('/sign-in');
        }
      } else {
        setError('Password reset requires additional steps.');
      }
    } catch (err: any) {
      const message = err?.errors?.[0]?.message || 'Unable to reset password.';
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

        <h2 className="text-2xl font-bold text-center text-[#0e62ae] mb-2">Reset Password</h2>
        <p className="text-sm text-center text-gray-600 mb-6">
          {step === 'request'
            ? "Enter your email to receive a reset code"
            : 'Enter the code sent to your email and choose a new password'}
        </p>

        {step === 'request' ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <Button
              type="submit"
              className="w-full bg-[#0e62ae] hover:bg-[#095397] text-white"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send Reset Code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <Input
              type="text"
              placeholder="Reset code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <Button
              type="submit"
              className="w-full bg-[#0e62ae] hover:bg-[#095397] text-white"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset Password'}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/sign-in"
            className="text-sm text-[#0e62ae] hover:text-[#094f91] underline"
          >
            ← Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
