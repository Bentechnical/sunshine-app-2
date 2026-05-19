'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useRouter } from 'next/navigation';
import { useSupabaseClient } from '@/utils/supabase/client';
import { geocodePostalCode } from '@/utils/geocode';

const formatPhoneNumber = (value: string) => {
  const cleaned = value.replace(/\D/g, '').slice(0, 10);
  const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
  if (match) {
    const parts = [match[1], match[2], match[3]].filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return `(${parts[0]}`;
    if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`;
    return `(${parts[0]}) ${parts[1]}-${parts[2]}`;
  }
  return value;
};

const formatPostalCode = (value: string) => {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return cleaned.length > 3 ? `${cleaned.slice(0, 3)} ${cleaned.slice(3)}` : cleaned;
};

const normalizePostalCode = (code: string) => {
  const cleaned = code.toUpperCase().replace(/\s+/g, '');
  return cleaned.length === 6 ? `${cleaned.slice(0, 3)} ${cleaned.slice(3)}` : cleaned;
};

const validatePostalCode = (code: string) =>
  /^[A-Za-z]\d[A-Za-z]\d[A-Za-z]\d$/.test(code.replace(/\s+/g, ''));

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

export default function PdCompleteForm() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [fadeIn, setFadeIn] = useState(false);
  const [phone, setPhone] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
  }, []);

  // Prefill phone if already on their Clerk/Supabase record
  useEffect(() => {
    if (!isLoaded || !user) return;
    const prefill = async () => {
      const { data } = await supabase
        .from('users')
        .select('phone_number, pd_postal_code')
        .eq('id', user.id)
        .single();
      if (data?.phone_number) setPhone(data.phone_number);
      if (data?.pd_postal_code) setPostalCode(data.pd_postal_code);
    };
    prefill();
  }, [isLoaded, user, supabase]);

  const handleSubmit = async () => {
    setError(null);

    if (!phone.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    if (!validatePostalCode(postalCode)) {
      setError('Postal code must be in the format A1A 1A1.');
      return;
    }

    setIsLoading(true);
    try {
      const normalized = normalizePostalCode(postalCode);

      const { error: updateError } = await supabase
        .from('users')
        .update({
          phone_number: phone.trim(),
          pd_postal_code: normalized,
          profile_complete: true,
        })
        .eq('id', user!.id);

      if (updateError) throw new Error(updateError.message);

      // Geocode postal code → pd_lat / pd_lng for proximity assignment
      await geocodePostalCode(normalized, user!.id, true);

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoaded || !user) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-100">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gray-50 overflow-y-auto flex items-start justify-center py-8 px-4">
      <div
        className={`w-full max-w-lg bg-white rounded-2xl shadow-lg overflow-hidden transition-opacity duration-500 ${
          fadeIn ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Blue logo header */}
        <div className="bg-[#0e62ae] px-6 py-4 flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/sunshine-logo-white.png"
            alt="Sunshine Therapy Dogs"
            className="h-8 object-contain"
          />
        </div>

        {/* Form body */}
        <div className="p-6 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Welcome{user.firstName ? `, ${user.firstName}` : ''}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              You&apos;ve been invited as a Program Director. Just a couple of details to finish setting up your account.
            </p>
          </div>

          <div>
            <label className={labelClass}>Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(formatPhoneNumber(e.target.value))}
              className={inputClass}
              placeholder="e.g. 416-555-0100"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className={labelClass}>Home Postal Code</label>
            <input
              type="text"
              value={postalCode}
              onChange={e => setPostalCode(formatPostalCode(e.target.value))}
              className={inputClass}
              placeholder="e.g. M5V 0K4"
              maxLength={8}
              disabled={isLoading}
            />
            <p className="text-xs text-gray-400 mt-1">
              Used to match you with visits in your area. Not shared publicly.
            </p>
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="px-6 py-2.5 bg-[#0e62ae] text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isLoading ? 'Saving…' : 'Complete Setup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
