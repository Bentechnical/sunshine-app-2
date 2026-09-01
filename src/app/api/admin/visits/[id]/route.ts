// GET /api/admin/visits/[id] — full visit details
// PATCH /api/admin/visits/[id] — edit visit details

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { updateVisitEvent, getTeamAssigned, addAttendeeToEvent, removeAttendeeFromEvent } from '@/utils/googleCalendar';
import { fromZonedTime } from 'date-fns-tz';

const EASTERN = 'America/New_York';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
      return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: visit, error } = await supabase
      .from('visits')
      .select(`
        *,
        org:organization_id(org_name, profile_image),
        visit_registrations(
          id, volunteer_id, status, waitlist_position,
          contact_shared, admin_note, cancellation_reason, cancelled_at, created_at,
          users:volunteer_id(first_name, last_name, email, phone_number)
        ),
        visit_notes(id, author_id, note_text, created_at,
          users:author_id(first_name, last_name))
      `)
      .eq('id', visitId)
      .single();

    if (error || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // Fetch dogs separately — 3-level nesting through an aliased FK
    // (users:volunteer_id → dogs) is unreliable in PostgREST.
    const registrations = (visit.visit_registrations ?? []) as any[];
    const volunteerIds = [...new Set(
      registrations.map((r: any) => r.volunteer_id).filter(Boolean)
    )] as string[];

    if (volunteerIds.length > 0) {
      const { data: dogs } = await supabase
        .from('dogs')
        .select('volunteer_id, dog_name, dog_breed, dog_picture_url')
        .in('volunteer_id', volunteerIds);

      if (dogs?.length) {
        const dogsByVolunteer = new Map<string, any[]>();
        for (const dog of dogs) {
          const arr = dogsByVolunteer.get(dog.volunteer_id) ?? [];
          arr.push(dog);
          dogsByVolunteer.set(dog.volunteer_id, arr);
        }
        for (const reg of registrations) {
          if (reg.users) {
            reg.users.dogs = dogsByVolunteer.get(reg.volunteer_id) ?? [];
          }
        }
      }
    }

    return NextResponse.json({ visit });
  } catch (err: any) {
    console.error('[GET /api/admin/visits/[id]] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { id } = await params;
    const visitId = parseInt(id, 10);
    if (isNaN(visitId)) {
      return NextResponse.json({ error: 'Invalid visit ID' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const body = await req.json();

    // Only allow updating specific fields
    const allowedFields = [
      'title', 'visit_date', 'start_time', 'end_time', 'address',
      'location_lat', 'location_lng', 'location_place_id', 'audience_age_ranges',
      'visitor_count_expected', 'event_description', 'approx_space_sqft',
      'fee_tier', 'fee_amount', 'volunteer_slots', 'parking_coverage',
      'parking_instructions', 'arrival_instructions', 'accessibility_notes',
      'requires_vsc', 'organization_id',
      'guest_org_name', 'guest_contact_name', 'guest_contact_email', 'guest_contact_phone',
      'admin_note', 'assigned_pd_id',
    ];

    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    // Convert HH:MM time strings to UTC timestamps (same logic as POST)
    const visitDate = body.visit_date ?? null;
    const isHHMM = (v: any) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
    if (visitDate && isHHMM(updates.start_time)) {
      updates.start_time = fromZonedTime(`${visitDate}T${updates.start_time}:00`, EASTERN).toISOString();
    }
    if (visitDate && isHHMM(updates.end_time)) {
      updates.end_time = fromZonedTime(`${visitDate}T${updates.end_time}:00`, EASTERN).toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Read old PD before updating (needed for calendar attendee swap)
    let oldPdId: string | null = null;
    if ('assigned_pd_id' in updates) {
      const { data: oldVisit } = await supabase
        .from('visits')
        .select('assigned_pd_id')
        .eq('id', visitId)
        .single();
      oldPdId = oldVisit?.assigned_pd_id ?? null;
    }

    const { error } = await supabase
      .from('visits')
      .update(updates)
      .eq('id', visitId);

    if (error) {
      console.error('[PATCH /api/admin/visits/[id]] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to update visit' }, { status: 500 });
    }

    // If any calendar-visible fields changed, update the Google Calendar event
    const calendarFields = ['title', 'visit_date', 'start_time', 'end_time', 'address',
      'guest_org_name', 'guest_contact_name', 'guest_contact_phone', 'guest_contact_email',
      'arrival_instructions', 'parking_instructions', 'parking_coverage', 'accessibility_notes',
      'event_description', 'fee_tier', 'fee_amount',
      'audience_age_ranges', 'visitor_count_expected'];
    const affectsCalendar = calendarFields.some(f => f in updates);

    if (affectsCalendar || 'assigned_pd_id' in updates) {
      const { data: fullVisit } = await supabase
        .from('visits')
        .select(`
          id, title, guest_org_name, guest_contact_name, guest_contact_email, guest_contact_phone,
          address, start_time, end_time, audience_age_ranges, visitor_count_expected,
          event_description, accessibility_notes, volunteer_slots, parking_coverage, parking_instructions,
          arrival_instructions, fee_tier, fee_amount, requires_vsc, requires_vaccine_record,
          admin_note, google_calendar_event_id, status
        `)
        .eq('id', visitId)
        .single();

      if (fullVisit?.google_calendar_event_id && fullVisit.status === 'approved') {
        // Update description/color/time (runs in background)
        if (affectsCalendar) {
          const teamAssigned = await getTeamAssigned(visitId);
          updateVisitEvent(fullVisit.google_calendar_event_id, fullVisit as any, teamAssigned)
            .catch(err => console.error('[PATCH visit] GCal update failed:', err));
        }

        // Swap PD attendee if assigned_pd_id changed
        if ('assigned_pd_id' in updates && oldPdId !== updates.assigned_pd_id) {
          const gcalEventId = fullVisit.google_calendar_event_id;
          (async () => {
            if (oldPdId) {
              const { data: oldPd } = await supabase.from('users').select('email').eq('id', oldPdId).single();
              if (oldPd?.email) await removeAttendeeFromEvent(gcalEventId, oldPd.email);
            }
            if (updates.assigned_pd_id) {
              const { data: newPd } = await supabase.from('users').select('email').eq('id', updates.assigned_pd_id).single();
              if (newPd?.email) await addAttendeeToEvent(gcalEventId, newPd.email);
            }
          })().catch(err => console.error('[PATCH visit] GCal PD swap failed:', err));
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH /api/admin/visits/[id]] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
