// GET /api/admin/visits/[id]/registrations
// List all registrations (confirmed, waitlisted, cancelled) for a visit.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(
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
