// /api/volunteer/dog/compliance
// PATCH: Updates vaccine compliance fields on the authenticated volunteer's dog record.
// DELETE: Removes the vaccine document from storage and clears the DB fields.

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { vaccine_record_url, vaccine_expiry_date, vaccine_date_issued, vaccine_upload_comment, vaccine_supporting_urls } = body;

  const supabase = createSupabaseAdminClient();

  const updatePayload: Record<string, unknown> = {
    vaccine_record_url,
    vaccine_expiry_date,
    vaccine_date_issued,
    vaccine_upload_comment: vaccine_upload_comment ?? null,
    // Reset verification on every upload/update — requires re-review by admin/PD
    vaccine_verification_status: 'pending_review',
    vaccine_verified_at: null,
    vaccine_verified_by: null,
    vaccine_rejection_reason: null,
  };

  // Only include supporting URLs if explicitly provided (avoid clearing on older clients)
  if (vaccine_supporting_urls !== undefined) {
    updatePayload.vaccine_supporting_urls = vaccine_supporting_urls ?? [];
  }

  const { data, error } = await supabase
    .from('dogs')
    .update(updatePayload)
    .eq('volunteer_id', userId)
    .select('id');

  if (error) {
    console.error('[PATCH /api/volunteer/dog/compliance]', error.message);
    return NextResponse.json({ error: 'Failed to update vaccine record' }, { status: 500 });
  }

  if (!data || data.length === 0) {
    console.error('[PATCH /api/volunteer/dog/compliance] No dog record found for volunteer:', userId);
    return NextResponse.json({ error: 'No dog record found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdminClient();

  // Get current paths so we can remove from storage
  const { data: dog } = await supabase
    .from('dogs')
    .select('vaccine_record_url, vaccine_supporting_urls')
    .eq('volunteer_id', userId)
    .single();

  // Remove primary doc and all supporting docs from storage
  const pathsToRemove: string[] = [];
  if (dog?.vaccine_record_url) pathsToRemove.push(dog.vaccine_record_url);
  if (dog?.vaccine_supporting_urls?.length) pathsToRemove.push(...dog.vaccine_supporting_urls);

  if (pathsToRemove.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('compliance-documents')
      .remove(pathsToRemove);
    if (storageError) {
      console.error('[DELETE /api/volunteer/dog/compliance] Storage error:', storageError.message);
    }
  }

  const { error } = await supabase
    .from('dogs')
    .update({
      vaccine_record_url: null,
      vaccine_expiry_date: null,
      vaccine_date_issued: null,
      vaccine_verification_status: null,
      vaccine_verified_at: null,
      vaccine_verified_by: null,
      vaccine_rejection_reason: null,
      vaccine_upload_comment: null,
      vaccine_supporting_urls: [],
    })
    .eq('volunteer_id', userId);

  if (error) {
    console.error('[DELETE /api/volunteer/dog/compliance]', error.message);
    return NextResponse.json({ error: 'Failed to remove document' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
