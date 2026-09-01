// src/app/(pages)/request-a-visit/page.tsx
'use client';

import { useState } from 'react';
import { CheckCircle } from 'lucide-react';

interface FormState {
  org_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  expected_visitors: string;
  max_volunteers: string;
  event_description: string;
  requires_vsc: boolean;
  parking_info: string;
  arrival_instructions: string;
  accessibility_notes: string;
}

const INITIAL: FormState = {
  org_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  visit_date: '',
  start_time: '',
  end_time: '',
  address: '',
  expected_visitors: '',
  max_volunteers: '2',
  event_description: '',
  requires_vsc: false,
  parking_info: '',
  arrival_instructions: '',
  accessibility_notes: '',
};

export default function RequestAVisitPage() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.org_name || !form.contact_name || !form.contact_email || !form.visit_date || !form.start_time || !form.end_time || !form.address) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/visit-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_org_name: form.org_name,
          guest_contact_name: form.contact_name,
          guest_contact_email: form.contact_email,
          guest_contact_phone: form.contact_phone || null,
          visit_date: form.visit_date,
          start_time: form.start_time,
          end_time: form.end_time,
          address: form.address,
          visitor_count_expected: form.expected_visitors ? parseInt(form.expected_visitors) : null,
          volunteer_slots: parseInt(form.max_volunteers) || 2,
          requires_vsc: form.requires_vsc,
          parking_instructions: form.parking_info || null,
          arrival_instructions: form.arrival_instructions || null,
          event_description: form.event_description || null,
          accessibility_notes: form.accessibility_notes || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to submit request. Please try again.');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  if (submitted) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow p-8 text-center">
          <CheckCircle className="mx-auto mb-4 text-green-500" size={48} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted!</h2>
          <p className="text-gray-600 mb-4">
            Thank you for reaching out. Our team will review your request and be in touch within 1–2 business days.
          </p>
          <p className="text-sm text-gray-500">
            Questions? Email us at{' '}
            <a href="mailto:info@sunshinetherapydogs.ca" className="text-blue-600 hover:underline">
              info@sunshinetherapydogs.ca
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Header */}
      <header className="bg-[#0e62ae] text-white px-6 py-4 shadow">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/sunshine-logo-white.png"
            alt="Sunshine Therapy Dogs"
            className="h-10 object-contain"
          />
          <a
            href="/sign-in"
            className="text-sm bg-white text-[#0e62ae] font-medium px-4 py-2 rounded hover:bg-gray-100 transition-colors"
          >
            Sign In
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Request a Therapy Dog Visit</h1>
          <p className="text-gray-600">
            Fill out the form below to request a visit from Sunshine Therapy Dogs. Our team will review your request and follow up to confirm.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Organization Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Organization Information</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Organization Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.org_name}
                  onChange={e => set('org_name', e.target.value)}
                  placeholder="e.g. Sunnybrook Care Home"
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Your Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    className={inputClass}
                    value={form.contact_name}
                    onChange={e => set('contact_name', e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Phone Number</label>
                  <input
                    type="tel"
                    className={inputClass}
                    value={form.contact_phone}
                    onChange={e => set('contact_phone', e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Email Address <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.contact_email}
                  onChange={e => set('contact_email', e.target.value)}
                  placeholder="you@organization.com"
                  required
                />
              </div>
            </div>
          </div>

          {/* Visit Details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Visit Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    className={inputClass}
                    value={form.visit_date}
                    onChange={e => set('visit_date', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Start Time <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    className={inputClass}
                    value={form.start_time}
                    onChange={e => set('start_time', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>End Time <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    className={inputClass}
                    value={form.end_time}
                    onChange={e => set('end_time', e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Address <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.address}
                  onChange={e => set('address', e.target.value)}
                  placeholder="Full street address"
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Event Description</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  value={form.event_description}
                  onChange={e => set('event_description', e.target.value)}
                  placeholder="What should volunteers know about this visit? Describe the event, audience, what to expect…"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Volunteer Teams Needed</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    className={inputClass}
                    value={form.max_volunteers}
                    onChange={e => set('max_volunteers', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Expected # of Visitors</label>
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={form.expected_visitors}
                    onChange={e => set('expected_visitors', e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Requirements & Instructions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Requirements &amp; Logistics</h2>
            <div className="space-y-4">
              <div>
                <p className={labelClass}>Volunteer Requirements</p>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.requires_vsc}
                      onChange={e => set('requires_vsc', e.target.checked)}
                    />
                    <span>VSC (Vulnerable Sector Check) required</span>
                  </label>
                </div>
              </div>
              <div>
                <label className={labelClass}>Parking Information</label>
                <input
                  type="text"
                  className={inputClass}
                  value={form.parking_info}
                  onChange={e => set('parking_info', e.target.value)}
                  placeholder="e.g. Free parking in Lot B off Main St."
                />
              </div>
              <div>
                <label className={labelClass}>Arrival Instructions</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  value={form.arrival_instructions}
                  onChange={e => set('arrival_instructions', e.target.value)}
                  placeholder="Sign-in procedures, access codes, who to ask for at reception, etc."
                />
              </div>
              <div>
                <label className={labelClass}>Accessibility</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={2}
                  value={form.accessibility_notes}
                  onChange={e => set('accessibility_notes', e.target.value)}
                  placeholder="Any accessibility requirements or notes (wheelchair access, allergies, etc.)"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 pb-8">
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3 bg-[#0e62ae] hover:bg-[#0a4f8f] text-white font-semibold rounded-lg transition disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
            <p className="text-sm text-gray-500">We'll follow up within 1–2 business days.</p>
          </div>
        </form>
      </main>
    </div>
  );
}
