// GET /api/admin/compliance/[volunteerId]/documents
// Returns signed URLs for a volunteer's VSC and vaccine documents.
// Signed URLs expire after 60 minutes.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ volunteerId: string }> }
) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const { volunteerId } = await params;
    const supabase = createSupabaseAdminClient();

    // Fetch volunteer's document paths
    const { data: volunteer, error: volunteerError } = await supabase
      .from('users')
      .select('id, first_name, last_name, vsc_document_url, dogs(vaccine_record_url, dog_name)')
      .eq('id', volunteerId)
      .eq('role', 'volunteer')
      .single();

    if (volunteerError || !volunteer) {
      return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 });
    }

    const dog = (volunteer.dogs as any[])?.[0] ?? null;
    const documents: Record<string, string | null> = {};

    // Generate signed URL for VSC document
    if (volunteer.vsc_document_url) {
      const { data: vscSigned, error: vscError } = await supabase.storage
        .from('compliance-documents')
        .createSignedUrl(volunteer.vsc_document_url, SIGNED_URL_EXPIRY_SECONDS);

      if (vscError) {
        console.error('[GET documents] VSC signed URL error:', vscError);
      }
      documents.vsc_signed_url = vscSigned?.signedUrl ?? null;
    } else {
      documents.vsc_signed_url = null;
    }

    // Generate signed URL for vaccine record
    if (dog?.vaccine_record_url) {
      const { data: vaccineSigned, error: vaccineError } = await supabase.storage
        .from('compliance-documents')
        .createSignedUrl(dog.vaccine_record_url, SIGNED_URL_EXPIRY_SECONDS);

      if (vaccineError) {
        console.error('[GET documents] Vaccine signed URL error:', vaccineError);
      }
      documents.vaccine_signed_url = vaccineSigned?.signedUrl ?? null;
    } else {
      documents.vaccine_signed_url = null;
    }

    return NextResponse.json({
      volunteer_id: volunteerId,
      volunteer_name: `${volunteer.first_name ?? ''} ${volunteer.last_name ?? ''}`.trim(),
      dog_name: dog?.dog_name ?? null,
      documents,
    });
  } catch (err: any) {
    console.error('[GET documents] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
