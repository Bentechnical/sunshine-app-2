// GET  /api/admin/visits/[id]/registrations — list all registrations for a visit
// POST /api/admin/visits/[id]/registrations — admin-assign a volunteer to a visit

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { getAppUrl } from '@/app/utils/getAppUrl';

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

    const { data: registrations, error } = await supabase
      .from('visit_registrations')
      .select(`
        id, visit_id, volunteer_id, status, waitlist_position,
        contact_shared, admin_note, cancellation_reason, cancelled_at, created_at, updated_at,
        users:volunteer_id(
          first_name, last_name, email, phone_number,
          vsc_document_url, vsc_date_issued, vsc_renewal_due,
          dogs(id, dog_name, dog_breed, vaccine_record_url, vaccine_expiry_date)
        )
      `)
      .eq('visit_id', visitId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET registrations] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch registrations' }, { status: 500 });
    }

    return NextResponse.json({ registrations: registrations ?? [] });
  } catch (err: any) {
    console.error('[GET registrations] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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

    const { volunteer_id } = await req.json();
    if (!volunteer_id) {
      return NextResponse.json({ error: 'volunteer_id is required' }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    // Fetch visit to check slot count
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, title, guest_org_name, address, visit_date, start_time, end_time, volunteer_slots')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    // Check for any existing registration (including cancelled)
    const { data: existing } = await supabase
      .from('visit_registrations')
      .select('id, status')
      .eq('visit_id', visitId)
      .eq('volunteer_id', volunteer_id)
      .maybeSingle();

    if (existing && existing.status !== 'cancelled') {
      return NextResponse.json({ error: 'Volunteer is already registered for this visit' }, { status: 409 });
    }

    // Count confirmed registrations to determine confirmed vs waitlisted
    const { count: confirmedCount } = await supabase
      .from('visit_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', visitId)
      .eq('status', 'confirmed');

    const slotsUsed = confirmedCount ?? 0;
    const status = slotsUsed < visit.volunteer_slots ? 'confirmed' : 'waitlisted';

    // Waitlist position if needed
    let waitlistPosition: number | null = null;
    if (status === 'waitlisted') {
      const { count: waitlistCount } = await supabase
        .from('visit_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('visit_id', visitId)
        .eq('status', 'waitlisted');
      waitlistPosition = (waitlistCount ?? 0) + 1;
    }

    let writeError;
    if (existing) {
      // Reactivate the cancelled registration to avoid duplicate key violation
      const { error } = await supabase
        .from('visit_registrations')
        .update({
          status,
          waitlist_position: waitlistPosition,
          cancellation_reason: null,
          cancelled_at: null,
        })
        .eq('id', existing.id);
      writeError = error;
    } else {
      const { error } = await supabase
        .from('visit_registrations')
        .insert({ visit_id: visitId, volunteer_id, status, waitlist_position: waitlistPosition });
      writeError = error;
    }

    if (writeError) {
      console.error('[POST registrations] Supabase error:', writeError);
      return NextResponse.json({ error: 'Failed to add volunteer' }, { status: 500 });
    }

    // Send confirmation email to the assigned volunteer
    const { data: volunteerUser } = await supabase
      .from('users')
      .select('email, first_name')
      .eq('id', volunteer_id)
      .single();

    if (volunteerUser?.email) {
      const v = visit as any;
      const visitTitle = v.title || v.guest_org_name || 'Therapy Dog Visit';
      const formattedDate = new Date(v.visit_date).toLocaleDateString('en-CA', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const formattedTime = [
        new Date(v.start_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
        new Date(v.end_time).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true }),
      ].join(' – ');

      sendTransactionalEmail({
        to: volunteerUser.email,
        subject: 'You\'ve been registered for a visit — Sunshine Therapy Dogs',
        templateName: 'visitAdminAssigned',
        data: {
          firstName: volunteerUser.first_name || 'there',
          visitTitle,
          visitDate: formattedDate,
          visitTime: formattedTime,
          visitAddress: v.address,
          dashboardLink: `${getAppUrl()}/dashboard/visits`,
          year: new Date().getFullYear(),
        },
      }).catch(err => console.error('[POST registrations] Failed to send volunteer email:', err));
    }

    return NextResponse.json({ success: true, status }, { status: 201 });
  } catch (err: any) {
    console.error('[POST registrations] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
