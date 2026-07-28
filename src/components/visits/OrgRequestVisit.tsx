// src/components/visits/OrgRequestVisit.tsx
'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { useSupabaseClient } from '@/utils/supabase/client';
import { VISIT_TIME_OPTIONS, endTimeOptions } from '@/utils/timeOptions';
import PlacesAutocomplete, { PlaceResult } from '@/components/ui/PlacesAutocomplete';

interface Props {
  onSuccess: () => void;
}

interface FormState {
  org_name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  title: string;
  visit_date: string;
  start_time: string;
  end_time: string;
  address: string;
  location_place_id: string;
  location_lat: number | null;
  location_lng: number | null;
  postal_code: string;
  max_volunteers: string;
  expected_visitors: string;
  requires_vsc: boolean;
  requires_vaccine: boolean;
  parking_coverage: string;
  parking_info: string;
  approx_space_sqft: string;
  special_instructions: string;
  notes_for_volunteer: string;
}

const INITIAL: FormState = {
  org_name: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  title: '',
  visit_date: '',
  start_time: '',
  end_time: '',
  address: '',
  location_place_id: '',
  location_lat: null,
  location_lng: null,
  postal_code: '',
  max_volunteers: '2',
  expected_visitors: '',
  requires_vsc: false,
  requires_vaccine: false,
  parking_coverage: '',
  parking_info: '',
  approx_space_sqft: '',
  special_instructions: '',
  notes_for_volunteer: '',
};

export default function OrgRequestVisit({ onSuccess }: Props) {
  const { user } = useUser();
  const supabase = useSupabaseClient();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-populate fields from org profile
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from('users')
        .select('org_name, org_address, org_contact_name, org_contact_phone, postal_code, email')
        .eq('id', user.id)
        .single();
      if (data) {
        setForm(prev => ({
          ...prev,
          org_name: data.org_name || '',
          address: prev.address || data.org_address || '',
          postal_code: prev.postal_code || data.postal_code || '',
          contact_name: prev.contact_name || data.org_contact_name || '',
          contact_phone: prev.contact_phone || data.org_contact_phone || '',
          contact_email: prev.contact_email || data.email || '',
        }));
      }
    };
    fetchProfile();
  }, [user?.id]);

  const set = (field: keyof FormState, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handlePlaceSelect = (result: PlaceResult) => {
    setForm(prev => ({
      ...prev,
      address: result.formatted_address,
      location_place_id: result.place_id,
      location_lat: result.lat,
      location_lng: result.lng,
      postal_code: result.postal_code || prev.postal_code,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.title || !form.visit_date || !form.start_time || !form.end_time || !form.address) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          visit_date: form.visit_date,
          start_time: form.start_time,
          end_time: form.end_time,
          address: form.address,
          location_place_id: form.location_place_id || null,
          location_lat: form.location_lat,
          location_lng: form.location_lng,
          postal_code: form.postal_code || null,
          guest_contact_name: form.contact_name || null,
          guest_contact_email: form.contact_email || null,
          guest_contact_phone: form.contact_phone || null,
          volunteer_slots: parseInt(form.max_volunteers) || 2,
          visitor_count_expected: form.expected_visitors ? parseInt(form.expected_visitors) : null,
          requires_vsc: form.requires_vsc,
          requires_vaccine_record: form.requires_vaccine,
          parking_coverage: form.parking_coverage || null,
          parking_instructions: form.parking_info || null,
          approx_space_sqft: form.approx_space_sqft ? parseInt(form.approx_space_sqft) : null,
          arrival_instructions: form.special_instructions || null,
          special_needs_notes: form.notes_for_volunteer || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to submit visit request.');
        return;
      }

      onSuccess();
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Request a Visit</h2>
      <p className="text-sm text-gray-500 mb-6">
        Submit a visit request and our team will review and confirm it with you.
      </p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Org name — read only */}
        {form.org_name && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">This visit will appear as hosted by</p>
            <p className="text-sm font-semibold text-gray-900">{form.org_name}</p>
          </div>
        )}

        {/* Title */}
        <div>
          <label className={labelClass}>Visit Title <span className="text-red-500">*</span></label>
          <input
            type="text"
            className={inputClass}
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="e.g. Therapy Dog Visit – Seniors Wing"
            required
          />
        </div>

        {/* Primary Contact */}
        <div>
          <p className={labelClass}>Primary Contact</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                type="text"
                className={inputClass}
                value={form.contact_name}
                onChange={e => set('contact_name', e.target.value)}
                placeholder="Contact name"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input
                type="tel"
                className={inputClass}
                value={form.contact_phone}
                onChange={e => set('contact_phone', e.target.value)}
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input
                type="email"
                className={inputClass}
                value={form.contact_email}
                onChange={e => set('contact_email', e.target.value)}
                placeholder="Email address"
              />
            </div>
          </div>
        </div>

        {/* Date & Time */}
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
            <select
              className={inputClass}
              value={form.start_time}
              onChange={e => {
                set('start_time', e.target.value);
                set('end_time', '');
              }}
              required
            >
              <option value="">Select time</option>
              {VISIT_TIME_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>End Time <span className="text-red-500">*</span></label>
            <select
              className={inputClass}
              value={form.end_time}
              onChange={e => set('end_time', e.target.value)}
              required
              disabled={!form.start_time}
            >
              <option value="">Select time</option>
              {endTimeOptions(form.start_time).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Address */}
        <div>
          <label className={labelClass}>Visit Address <span className="text-red-500">*</span></label>
          <PlacesAutocomplete
            value={form.address}
            onSelect={handlePlaceSelect}
            onChange={v => set('address', v)}
            className={inputClass}
            placeholder="Start typing the visit location…"
          />
          <p className="text-xs text-gray-400 mt-1">Select from the dropdown to confirm the address.</p>
        </div>

        {/* Slots, Visitors & Space */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Number of dogs requested <span className="text-red-500">*</span></label>
            <input
              type="number"
              min={1}
              max={4}
              className={inputClass}
              value={form.max_volunteers}
              onChange={e => set('max_volunteers', e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Estimated Participants</label>
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
        <div>
          <label className={labelClass}>Approx. Event Space (sq ft)</label>
          <input
            type="number"
            min={1}
            className={inputClass}
            value={form.approx_space_sqft}
            onChange={e => set('approx_space_sqft', e.target.value)}
            placeholder="Optional"
          />
        </div>

        {/* Requirements */}
        <div>
          <p className={labelClass}>Requirements</p>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_vsc}
                onChange={e => set('requires_vsc', e.target.checked)}
              />
              <span>VSC (Vulnerable Sector Check) required</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.requires_vaccine}
                onChange={e => set('requires_vaccine', e.target.checked)}
              />
              <span>Dog vaccine records required</span>
            </label>
          </div>
        </div>

        {/* Parking */}
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Parking</label>
            <select
              className={inputClass}
              value={form.parking_coverage}
              onChange={e => set('parking_coverage', e.target.value)}
            >
              <option value="">— Select —</option>
              <option value="free_on_site">Free parking on-site</option>
              <option value="reimbursed_on_site">Volunteers pay — reimbursed on-site</option>
              <option value="invoice">Volunteers pay — added to invoice</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Parking details for volunteers</label>
            <input
              type="text"
              className={inputClass}
              value={form.parking_info}
              onChange={e => set('parking_info', e.target.value)}
              placeholder="e.g. Street parking on Main St., paid lot on 2nd Ave."
            />
          </div>
        </div>

        {/* Special Instructions */}
        <div>
          <label className={labelClass}>Special Instructions</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={form.special_instructions}
            onChange={e => set('special_instructions', e.target.value)}
            placeholder="Any special access instructions, sign-in procedures, etc."
          />
        </div>

        {/* Notes for Volunteer */}
        <div>
          <label className={labelClass}>Notes for Volunteers</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={form.notes_for_volunteer}
            onChange={e => set('notes_for_volunteer', e.target.value)}
            placeholder="What should volunteers know? Who to ask for, what to expect, etc."
          />
        </div>

        <div className="pt-2 flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-[#0e62ae] hover:bg-[#0a4f8f] text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Request'}
          </button>
          <p className="text-xs text-gray-500">Our team will review and confirm your visit within 1–2 business days.</p>
        </div>
      </form>
    </div>
  );
}
