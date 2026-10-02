// GET /api/volunteer/compliance/documents
// Returns signed URLs for the authenticated volunteer's own compliance documents.

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createSupabaseAdminClient();

  // Query user and dog separately to avoid relying on FK inference
  const [userRes, dogRes] = await Promise.all([
    supabase.from('users').select('vsc_document_url').eq('id', userId).eq('role', 'volunteer').single(),
    supabase.from('dogs').select('vaccine_record_url, vaccine_supporting_urls').eq('volunteer_id', userId).maybeSingle(),
  ]);

  if (userRes.error || !userRes.data) {
    return NextResponse.json({ error: 'Volunteer not found' }, { status: 404 });
  }

  const volunteer = userRes.data;
  const dog = dogRes.data ?? null;

  const result: { vsc_signed_url: string | null; vaccine_signed_url: string | null; vaccine_supporting_signed_urls: string[] } = {
    vsc_signed_url: null,
    vaccine_signed_url: null,
    vaccine_supporting_signed_urls: [],
  };

  if (volunteer.vsc_document_url) {
    const { data } = await supabase.storage
      .from('compliance-documents')
      .createSignedUrl(volunteer.vsc_document_url, SIGNED_URL_EXPIRY_SECONDS);
    result.vsc_signed_url = data?.signedUrl ?? null;
  }

  if (dog?.vaccine_record_url) {
    const { data } = await supabase.storage
      .from('compliance-documents')
      .createSignedUrl(dog.vaccine_record_url, SIGNED_URL_EXPIRY_SECONDS);
    result.vaccine_signed_url = data?.signedUrl ?? null;
  }

  // Generate signed URLs for supporting vaccine docs
  if (dog?.vaccine_supporting_urls?.length) {
    for (const path of dog.vaccine_supporting_urls) {
      const { data } = await supabase.storage
        .from('compliance-documents')
        .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
      if (data?.signedUrl) result.vaccine_supporting_signed_urls.push(data.signedUrl);
    }
  }

  return NextResponse.json(result);
}
