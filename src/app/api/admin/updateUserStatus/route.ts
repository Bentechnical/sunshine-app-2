// src/app/api/admin/updateUserStatus/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '../../../utils/mailer'; // ✅ Added

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const body = await req.json();

    console.log('[updateUserStatus] Incoming body:', body);

    const { user_id, new_status, status } = body;
    const resolvedStatus = new_status ?? status;

    if (!user_id || !resolvedStatus) {
      console.error('[updateUserStatus] Invalid request data:', body);
      return NextResponse.json({ error: 'Missing user_id or status' }, { status: 400 });
    }

    // Update user status
    const { error: userError } = await supabase
      .from('users')
      .update({ status: resolvedStatus })
      .eq('id', user_id);

    if (userError) {
      console.error('[updateUserStatus] Failed to update user:', userError.message);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    // Also update corresponding dog (assuming 1:1 mapping for now)
    const { error: dogError } = await supabase
      .from('dogs')
      .update({ status: resolvedStatus })
      .eq('volunteer_id', user_id);

    if (dogError) {
      console.error('[updateUserStatus] Failed to update dog:', dogError.message);
      return NextResponse.json({ error: dogError.message }, { status: 500 });
    }

    // ✅ Send approval email if newly approved
    if (resolvedStatus === 'approved') {
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('email, first_name, role')
        .eq('id', user_id)
        .single();

      if (fetchError) {
        console.error('[updateUserStatus] Failed to fetch user email:', fetchError.message);
      } else if (userData?.email) {
        // Use role-specific template
        const templateName = userData.role === 'individual'
          ? 'userApprovedIndividual'
          : 'userApprovedVolunteer';

        await sendTransactionalEmail({
          to: userData.email,
          subject: 'Your profile has been approved!',
          templateName,
          data: {
            firstName: userData.first_name ?? 'there',
            year: new Date().getFullYear(),
            dashboardLink: 'https://sunshinedogs.app/dashboard',
          },
        });
        console.log(`[Resend] Approval email sent to ${userData.email}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[updateUserStatus] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
