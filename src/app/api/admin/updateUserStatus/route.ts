// src/app/api/admin/updateUserStatus/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { sendTransactionalEmail } from '../../../utils/mailer';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { autoAssignRegion } from '@/utils/autoAssignRegion';

export async function POST(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

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
    // First check if volunteer has any dogs
    const { data: existingDogs, error: checkError } = await supabase
      .from('dogs')
      .select('id, dog_name, status')
      .eq('volunteer_id', user_id);

    if (checkError) {
      console.error('[updateUserStatus] Failed to check for dogs:', checkError.message);
    } else {
      console.log('[updateUserStatus] Found dogs for volunteer:', existingDogs);
    }

    const { data: dogData, error: dogError } = await supabase
      .from('dogs')
      .update({ status: resolvedStatus })
      .eq('volunteer_id', user_id)
      .select('id, dog_name, status');

    if (dogError) {
      console.error('[updateUserStatus] Failed to update dog:', dogError.message);
      return NextResponse.json({ error: dogError.message }, { status: 500 });
    }

    console.log('[updateUserStatus] Dog update result:', dogData);
    if (dogData && dogData.length === 0) {
      console.warn('[updateUserStatus] No dogs found for volunteer_id:', user_id);
    } else if (dogData) {
      console.log('[updateUserStatus] Successfully updated dog(s):', dogData.map(d => `${d.dog_name} (${d.id}) -> ${d.status}`));
    }

    // ✅ Auto-assign region on approval (volunteers and orgs only)
    if (resolvedStatus === 'approved') {
      const { data: roleCheck } = await supabase
        .from('users')
        .select('role, assigned_region_id')
        .eq('id', user_id)
        .single();

      console.log(`[updateUserStatus] Role check for ${user_id}:`, roleCheck);
      if (roleCheck && (roleCheck.role === 'volunteer' || roleCheck.role === 'organization') && !roleCheck.assigned_region_id) {
        console.log(`[updateUserStatus] Running autoAssignRegion for ${user_id}...`);
        const { region_id, method } = await autoAssignRegion(user_id);
        console.log(`[updateUserStatus] autoAssignRegion result: region_id=${region_id}, method=${method}`);
        if (region_id) {
          const { error: assignErr } = await supabase
            .from('users')
            .update({ assigned_region_id: region_id, region_assignment_method: method })
            .eq('id', user_id);
          if (assignErr) {
            console.error(`[updateUserStatus] Failed to write region assignment:`, assignErr.message);
          } else {
            console.log(`[updateUserStatus] Auto-assigned region ${region_id} (${method}) to user ${user_id}`);
          }
        } else {
          console.warn(`[updateUserStatus] autoAssignRegion returned null — no FSA match and no distance fallback for user ${user_id}`);
        }
      } else {
        console.log(`[updateUserStatus] Skipping auto-assign: role=${roleCheck?.role}, already_assigned=${!!roleCheck?.assigned_region_id}`);
      }
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
