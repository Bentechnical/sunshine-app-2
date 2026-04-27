'use client';

// src/app/admin/support/users/[userId]/preview/SupportPreviewPage.tsx
// Read-only dashboard preview rendered on behalf of a target user by an admin.

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowLeft, ShieldAlert, User, Dog, Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import type { UserProfile, DogProfile, AppointmentRow } from './page';

interface Props {
  adminUserId: string;
  targetUser: UserProfile;
  dog: DogProfile | null;
  appointments: AppointmentRow[];
}

export default function SupportPreviewPage({ targetUser, dog, appointments }: Props) {
  const [appointmentsOpen, setAppointmentsOpen] = useState(true);

  const fullName = `${targetUser.first_name} ${targetUser.last_name}`;
  const roleLabel = targetUser.role === 'volunteer' ? 'Volunteer' : 'Individual';

  const now = new Date();
  const upcoming = appointments.filter(
    (a) => (a.status === 'pending' || a.status === 'confirmed') && new Date(a.start_time) >= now
  );
  const past = appointments.filter(
    (a) => a.status === 'confirmed' && new Date(a.start_time) < now
  );
  const cancelled = appointments.filter((a) => a.status === 'cancelled');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Preview Banner */}
      <div className="sticky top-0 z-50 bg-amber-500 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <ShieldAlert className="shrink-0 w-5 h-5" />
            <div>
              <p className="font-bold text-sm leading-tight">Admin Support Preview Mode</p>
              <p className="text-xs text-amber-100 leading-tight">
                Viewing as <span className="font-semibold text-white">{fullName}</span>
                {' '}&middot;{' '}
                <span className="font-semibold text-white">{targetUser.email}</span>
                {' '}&middot;{' '}
                <span className="font-semibold text-white">{roleLabel}</span>
                {' '}&middot;{' '}
                Status: <span className="font-semibold text-white">{targetUser.status}</span>
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/admin"
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 transition-colors px-3 py-1.5 rounded-md whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Admin
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Profile Card */}
        <Section icon={<User className="w-4 h-4" />} title="Profile">
          <div className="flex flex-col md:flex-row items-start gap-5">
            {targetUser.profile_image && (
              <div className="shrink-0 mx-auto md:mx-0">
                <div className="relative w-32 aspect-square rounded-xl overflow-hidden shadow-md">
                  <Image
                    src={targetUser.profile_image}
                    alt="Profile"
                    fill
                    className="object-cover"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 flex flex-col gap-1.5">
              <h3 className="text-2xl font-bold text-gray-900">{fullName}</h3>
              <div className="flex flex-col gap-1 mt-1 text-sm">
                <Field label="Email" value={targetUser.email} />
                <Field label="Phone" value={targetUser.phone_number ?? 'Not provided'} />
                {targetUser.postal_code && <Field label="Postal Code" value={targetUser.postal_code} />}
                {targetUser.pronouns && <Field label="Pronouns" value={targetUser.pronouns} />}
                {targetUser.birthday && targetUser.visit_recipient_type !== 'other' && (
                  <Field label="Birth Year" value={String(targetUser.birthday)} />
                )}
                {targetUser.role === 'volunteer' && targetUser.travel_distance_km && (
                  <Field label="Travel Distance" value={`${targetUser.travel_distance_km} km`} />
                )}
              </div>
            </div>
          </div>

          {/* Extended individual fields */}
          {targetUser.role === 'individual' && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-4 text-sm">
              {targetUser.visit_recipient_type === 'other' && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Visit Recipient</p>
                  <Field label="Name" value={targetUser.dependant_name ?? '—'} />
                  <Field label="Relationship" value={targetUser.relationship_to_recipient ?? '—'} />
                </div>
              )}
              {targetUser.bio && <BlockField label="Reason for Visit" value={targetUser.bio} />}
              {targetUser.physical_address && <BlockField label="Location of Visits" value={targetUser.physical_address} />}
              {targetUser.other_pets_on_site && (
                <BlockField label="Other Animals on Site" value={targetUser.other_pets_description ?? 'Yes'} />
              )}
              {targetUser.third_party_available && (
                <BlockField label="Third Party Contact" value={targetUser.third_party_available} />
              )}
              {targetUser.additional_information && (
                <BlockField label="Additional Information" value={targetUser.additional_information} />
              )}
            </div>
          )}

          {/* Extended volunteer fields */}
          {targetUser.role === 'volunteer' && targetUser.bio && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-sm">
              <BlockField label="Bio" value={targetUser.bio} />
            </div>
          )}
        </Section>

        {/* Dog Profile (volunteers only) */}
        {targetUser.role === 'volunteer' && (
          <Section icon={<Dog className="w-4 h-4" />} title="Therapy Dog">
            {dog ? (
              <div className="flex flex-col sm:flex-row gap-5">
                {dog.dog_picture_url && (
                  <div className="shrink-0 mx-auto sm:mx-0">
                    <div className="relative w-40 aspect-square rounded-xl overflow-hidden shadow-md">
                      <Image
                        src={dog.dog_picture_url}
                        alt={dog.dog_name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                )}
                <div className="flex-1 flex flex-col gap-2">
                  <h3 className="text-xl font-bold text-gray-900">{dog.dog_name}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                      {dog.dog_breed || 'Unknown breed'}
                    </span>
                    {typeof dog.dog_age === 'number' && (
                      <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                        {dog.dog_age} yr{dog.dog_age === 1 ? '' : 's'} old
                      </span>
                    )}
                  </div>
                  {dog.dog_bio && <BlockField label="About" value={dog.dog_bio} />}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No dog profile on file.</p>
            )}
          </Section>
        )}

        {/* Appointments */}
        <Section
          icon={<Calendar className="w-4 h-4" />}
          title={`Appointments (${appointments.length})`}
          collapsible
          open={appointmentsOpen}
          onToggle={() => setAppointmentsOpen((v) => !v)}
        >
          {appointmentsOpen && (
            <div className="flex flex-col gap-5">
              <AppointmentGroup
                label="Upcoming"
                appointments={upcoming}
                targetUserId={targetUser.id}
                emptyMessage="No upcoming appointments."
              />
              <AppointmentGroup
                label="Past"
                appointments={past}
                targetUserId={targetUser.id}
                emptyMessage="No past appointments."
              />
              <AppointmentGroup
                label="Cancelled"
                appointments={cancelled}
                targetUserId={targetUser.id}
                emptyMessage="No cancelled appointments."
                showCancellationReason
              />
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}

// ---- Sub-components ----

function Section({
  icon,
  title,
  children,
  collapsible = false,
  open,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div
        className={`flex items-center gap-2 mb-4 ${collapsible ? 'cursor-pointer select-none' : ''}`}
        onClick={collapsible ? onToggle : undefined}
      >
        <span className="text-gray-400">{icon}</span>
        <h2 className="text-base font-semibold text-gray-800 flex-1">{title}</h2>
        {collapsible && (
          open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-gray-500">{label}:</span>{' '}
      <span className="text-gray-800">{value}</span>
    </p>
  );
}

function BlockField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-gray-700 leading-relaxed">{value}</p>
    </div>
  );
}

function AppointmentGroup({
  label,
  appointments,
  targetUserId,
  emptyMessage,
  showCancellationReason = false,
}: {
  label: string;
  appointments: AppointmentRow[];
  targetUserId: string;
  emptyMessage: string;
  showCancellationReason?: boolean;
}) {
  const statusStyles: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-green-100  text-green-800',
    cancelled: 'bg-red-100    text-red-800',
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
        {label} ({appointments.length})
      </h3>
      {appointments.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{emptyMessage}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {appointments.map((appt) => {
            const otherParty =
              appt.individual?.id === targetUserId ? appt.volunteer : appt.individual;
            const otherName = otherParty
              ? `${otherParty.first_name} ${otherParty.last_name}`
              : 'Unknown';
            const dogName =
              appt.volunteer?.dogs?.[0]?.dog_name ?? null;

            return (
              <div
                key={appt.id}
                className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 text-sm"
              >
                <div className="flex-1 flex flex-col gap-0.5">
                  <p className="font-medium text-gray-900">
                    {format(new Date(appt.start_time), 'EEE, MMM d yyyy • h:mm a')}
                    {' — '}
                    {format(new Date(appt.end_time), 'h:mm a')}
                  </p>
                  <p className="text-gray-600">
                    With {otherName}
                    {dogName ? ` & ${dogName}` : ''}
                  </p>
                  {showCancellationReason && appt.cancellation_reason && (
                    <p className="text-xs text-red-600 mt-0.5">
                      Reason: {appt.cancellation_reason}
                    </p>
                  )}
                  {appt.notes && (
                    <p className="text-xs text-gray-500 mt-0.5">Notes: {appt.notes}</p>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${statusStyles[appt.status] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}