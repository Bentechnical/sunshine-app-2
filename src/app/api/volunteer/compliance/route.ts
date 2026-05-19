// /api/volunteer/compliance
// PATCH: Updates VSC compliance fields on the authenticated volunteer's user record.
// DELETE: Removes the VSC document from storage and clears the DB fields.

import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { vsc_document_url, vsc_date_issued } = body;

  // Compute renewal due date as 3 years from issue date
  let vsc_renewal_due: string | null = null;
  if (vsc_date_issued) {
    const issued = new Date(vsc_date_issued);
    issued.setFullYear(issued.getFullYear() + 3);
    vsc_renewal_due = issued.toISOString().split('T')[0];
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from('users')
    .update({ vsc_document_url, vsc_date_issued, vsc_renewal_due })
    .eq('id', userId)
    .eq('role', 'volunteer');

  if (error) {
    console.error('[PATCH /api/volunteer/compliance]', error.message);
    return NextResponse.json({ error: 'Failed to update compliance' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdminClient();

  // Get current path so we can remove from storage
  const { data: volunteer } = await supabase
    .from('users')
    .select('vsc_document_url')
    .eq('id', userId)
    .single();

  if (volunteer?.vsc_document_url) {
    const { error: storageError } = await supabase.storage
      .from('compliance-documents')
      .remove([volunteer.vsc_document_url]);
    if (storageError) {
      console.error('[DELETE /api/volunteer/compliance] Storage error:', storageError.message);
    }
  }

  const { error } = await supabase
    .from('users')
    .update({ vsc_document_url: null, vsc_date_issued: null, vsc_renewal_due: null })
    .eq('id', userId);

  if (error) {
    console.error('[DELETE /api/volunteer/compliance]', error.message);
    return NextResponse.json({ error: 'Failed to remove document' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
