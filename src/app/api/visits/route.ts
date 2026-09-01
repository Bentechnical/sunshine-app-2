// POST /api/visits
// Organization account holders submit a visit request.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { fromZonedTime } from 'date-fns-tz';
import { geocodePostalCodeServer } from '@/utils/geocode';
import { sendTransactionalEmail } from '@/app/utils/mailer';

const EASTERN = 'America/New_York';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();

    // Verify caller is an approved organization
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role, status, fee_tier, assigned_region_id, email, org_name, org_contact_name')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.role !== 'organization') {
      return NextResponse.json({ error: 'Organization account required' }, { status: 403 });
    }
    if (user.status !== 'approved') {
      return NextResponse.json({ error: 'Your account is pending approval' }, { status: 403 });
    }

    // Resolve the responsible PD from the org's assigned region
    let assignedPdId: string | null = null;
    if (user.assigned_region_id) {
      const { data: region } = await supabase
        .from('pd_regions')
        .select('owner_pd_id')
        .eq('id', user.assigned_region_id)
        .single();
      assignedPdId = region?.owner_pd_id ?? null;
    }

    const body = await req.json();
    const {
      title,
      visit_date,
      start_time,
      end_time,
      address,
      location_place_id,
      location_lat,
      location_lng,
      postal_code,
      guest_contact_name,
      guest_contact_email,
      guest_contact_phone,
      audience_age_ranges,
      visitor_count_expected,
      event_description,
      approx_space_sqft,
      volunteer_slots,
      parking_coverage,
      parking_instructions,
      arrival_instructions,
      accessibility_notes,
      requires_vsc,
    } = body;

    if (!visit_date || !start_time || !end_time || !address) {
      return NextResponse.json(
        { error: 'Visit date, start time, end time, and address are required' },
        { status: 400 }
      );
    }

    // Combine visit_date + time into full ISO timestamps
    const startTimestamp = fromZonedTime(`${visit_date}T${start_time}:00`, EASTERN).toISOString();
    const endTimestamp = fromZonedTime(`${visit_date}T${end_time}:00`, EASTERN).toISOString();

    // Use lat/lng from Places selection if provided; fall back to postal code geocoding
    let resolvedLat = location_lat ?? null;
    let resolvedLng = location_lng ?? null;
    if (!resolvedLat && !resolvedLng && postal_code) {
      const geo = await geocodePostalCodeServer(postal_code);
      if (geo) {
        resolvedLat = geo.lat;
        resolvedLng = geo.lng;
      }
    }

    const { data: visit, error } = await supabase
      .from('visits')
      .insert({
        organization_id: userId,
        created_by: userId,
        title: title ?? null,
        visit_date,
        start_time: startTimestamp,
        end_time: endTimestamp,
        address,
        location_place_id: location_place_id ?? null,
        postal_code: postal_code ?? null,
        guest_contact_name: guest_contact_name ?? null,
        guest_contact_email: guest_contact_email ?? null,
        guest_contact_phone: guest_contact_phone ?? null,
        location_lat: resolvedLat,
        location_lng: resolvedLng,
        audience_age_ranges: audience_age_ranges ?? null,
        visitor_count_expected: visitor_count_expected ?? null,
        event_description: event_description ?? null,
        approx_space_sqft: approx_space_sqft ?? null,
        volunteer_slots: volunteer_slots ?? 1,
        parking_coverage: parking_coverage ?? null,
        parking_instructions: parking_instructions ?? null,
        arrival_instructions: arrival_instructions ?? null,
        accessibility_notes: accessibility_notes ?? null,
        requires_vsc: requires_vsc ?? false,
        requires_vaccine_record: true, // always required for all visits
        status: 'pending_review',
        assigned_pd_id: assignedPdId,
        fee_tier: user.fee_tier ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[POST /api/visits] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to submit visit request' }, { status: 500 });
    }

    // Send confirmation email to org contact
    const primaryEmail = user.email;
    const eventEmail = guest_contact_email ?? null;
    const contactName = guest_contact_name || user.org_contact_name || user.org_name || 'there';
    const formattedDate = new Date(visit_date).toLocaleDateString('en-CA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    if (primaryEmail) {
      const ccEmail = eventEmail && eventEmail !== primaryEmail ? eventEmail : undefined;
      sendTransactionalEmail({
        to: primaryEmail,
        ...(ccEmail ? { cc: ccEmail } : {}),
        subject: 'Your visit request has been received — Sunshine Therapy Dogs',
        templateName: 'visitRequestReceived',
        data: {
          contactName,
          orgName: user.org_name || guest_contact_name || 'your organization',
          visitDate: formattedDate,
          visitAddress: address,
          visitAddressMapLink: address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null,
          year: new Date().getFullYear(),
        },
      }).catch(err => console.error('[POST /api/visits] Failed to send confirmation email:', err));
    }
    // TODO: Notify admin/PD of new pending visit request

    return NextResponse.json({ success: true, visitId: visit.id }, { status: 201 });
  } catch (err: any) {
    console.error('[POST /api/visits] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
