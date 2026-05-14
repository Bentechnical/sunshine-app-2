// PATCH /api/admin/compliance/[volunteerId]
// Admin manually updates a volunteer's compliance fields.
// Can update VSC dates or vaccine expiry on behalf of the volunteer.
// Body: { vsc_date_issued?, vsc_renewal_due?, vaccine_expiry_date?, vaccine_cycle_years? }

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ volunteerId: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { volunteerId } = await params;
    const body = await req.json();

    const supabase = createSupabaseAdminClient();

    // Verify this is actually a volunteer
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('id, role, dogs(id)')
      .eq('id', volunteerId)
      .eq('role', 'volunteer')
      .single();

    if (volunteerError || !volunteer) {
      return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 });
    }

    const { vsc_date_issued, vsc_renewal_due, vaccine_expiry_date, vaccine_cycle_years } = body;

    // Update VSC fields on users table
    const userUpdates: Record<string, any> = {};
    if (vsc_date_issued !== undefined) userUpdates.vsc_date_issued = vsc_date_issued;
    if (vsc_renewal_due !== undefined) userUpdates.vsc_renewal_due = vsc_renewal_due;

    if (Object.keys(userUpdates).length > 0) {
      const { error: userUpdateError } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', volunteerId);

      if (userUpdateError) {
        console.error('[PATCH compliance] User update error:', userUpdateError);
        return NextResponse.json({ error: 'Failed to update VSC fields' }, { status: 500 });
      }
    }

    // Update vaccine fields on dogs table
    const dogUpdates: Record<string, any> = {};
    if (vaccine_expiry_date !== undefined) dogUpdates.vaccine_expiry_date = vaccine_expiry_date;
    if (vaccine_cycle_years !== undefined) dogUpdates.vaccine_cycle_years = vaccine_cycle_years;

    if (Object.keys(dogUpdates).length > 0) {
      const dog = (volunteer.dogs as any[])?.[0];
      if (!dog) {
        return NextResponse.json({ error: 'No dog found for this volunteer' }, { status: 404 });
      }

      const { error: dogUpdateError } = await supabase
        .from('dogs')
        .update(dogUpdates)
        .eq('id', dog.id);

      if (dogUpdateError) {
        console.error('[PATCH compliance] Dog update error:', dogUpdateError);
        return NextResponse.json({ error: 'Failed to update vaccine fields' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[PATCH compliance] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
