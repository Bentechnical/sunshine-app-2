// src/app/admin/support/users/[userId]/preview/page.tsx
// Server component — auth check, data fetch, audit log, then renders client UI.

import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import SupportPreviewPage from './SupportPreviewPage';

interface PageProps {
  params: Promise<{ userId: string }>;
}

export default async function SupportPreviewRoute({ params }: PageProps) {
  const { userId: adminUserId } = await auth();

  if (!adminUserId) {
    redirect('/sign-in');
  }

  const supabase = createSupabaseAdminClient();

  // Verify the caller is an admin
  const { data: adminUser, error: adminError } = await supabase
    .from('users')
    .select('role')
    .eq('id', adminUserId)
    .single();

  if (adminError || adminUser?.role !== 'admin') {
    redirect('/dashboard');
  }

  const { userId: targetUserId } = await params;

  // Fetch target user profile
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select(
      `id, first_name, last_name, email, phone_number, profile_image, bio, role, status,
       postal_code, travel_distance_km, pronouns, birthday, physical_address,
       other_pets_on_site, other_pets_description, third_party_available,
       additional_information, liability_waiver_accepted, liability_waiver_accepted_at,
       visit_recipient_type, relationship_to_recipient, dependant_name`
    )
    .eq('id', targetUserId)
    .single();

  if (targetError || !targetUser) {
    notFound();
  }

  if (targetUser.role === 'admin') {
    // Don't allow previewing other admin accounts
    redirect('/dashboard/admin');
  }

  // Fetch dog profile (volunteers only)
  let dog: DogProfile | null = null;
  if (targetUser.role === 'volunteer') {
    const { data: dogData } = await supabase
      .from('dogs')
      .select('dog_name, dog_breed, dog_bio, dog_age, dog_picture_url')
      .eq('volunteer_id', targetUserId)
      .single();
    dog = dogData ?? null;
  }

  // Fetch appointments
  const { data: appointments } = await supabase
    .from('appointments')
    .select(
      `id, start_time, end_time, status, cancellation_reason, notes, location_type, location_details,
       individual:individual_id (id, first_name, last_name, email),
       volunteer:volunteer_id (id, first_name, last_name, email,
         dogs (dog_name, dog_picture_url, dog_breed)
       )`
    )
    .or(`individual_id.eq.${targetUserId},volunteer_id.eq.${targetUserId}`)
    .order('start_time', { ascending: false })
    .limit(50);

  // Audit log — fire and forget, don't block the page render on failure
  supabase
    .from('admin_actions')
    .insert({
      admin_user_id: adminUserId,
      target_user_id: targetUserId,
      action: 'support_preview_view',
      metadata: {
        target_role: targetUser.role,
        target_email: targetUser.email,
      },
    })
    .then(({ error }) => {
      if (error) {
        console.error('[SupportPreview] Failed to log audit action:', error.message);
      }
    });

  return (
    <SupportPreviewPage
      adminUserId={adminUserId}
      targetUser={targetUser as UserProfile}
      dog={dog}
      appointments={(appointments ?? []) as AppointmentRow[]}
    />
  );
}

// ---- Shared types (also imported by SupportPreviewPage) ----

export interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string | null;
  profile_image?: string | null;
  bio?: string | null;
  postal_code?: string | null;
  travel_distance_km?: number | null;
  role: 'individual' | 'volunteer';
  status: string;
  pronouns?: string | null;
  birthday?: number | null;
  physical_address?: string | null;
  other_pets_on_site?: boolean | null;
  other_pets_description?: string | null;
  third_party_available?: string | null;
  additional_information?: string | null;
  liability_waiver_accepted?: boolean | null;
  liability_waiver_accepted_at?: string | null;
  visit_recipient_type?: string | null;
  relationship_to_recipient?: string | null;
  dependant_name?: string | null;
}

export interface DogProfile {
  dog_name: string;
  dog_breed: string;
  dog_bio?: string | null;
  dog_age?: number | null;
  dog_picture_url?: string | null;
}

export interface AppointmentRow {
  id: number;
  start_time: string;
  end_time: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  cancellation_reason?: string | null;
  notes?: string | null;
  location_type?: string | null;
  location_details?: string | null;
  individual: { id: string; first_name: string; last_name: string; email: string } | null;
  volunteer: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    dogs: { dog_name: string; dog_picture_url: string | null; dog_breed: string }[];
  } | null;
}
