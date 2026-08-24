// GET /api/admin/compliance
// List all volunteers with their VSC and vaccine compliance status.
// Query params: status (missing|uploaded|expiring|expired — filters by overall compliance state)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

type ComplianceStatus = 'missing' | 'pending_review' | 'approved' | 'expiring' | 'expired' | 'rejected';

function getComplianceStatus(
  documentUrl: string | null,
  expiryDate: string | null,
  verificationStatus: string | null,
): ComplianceStatus {
  if (!documentUrl) return 'missing';
  if (verificationStatus === 'rejected') return 'rejected';
  if (!verificationStatus || verificationStatus === 'pending_review') return 'pending_review';
  // verificationStatus === 'approved'
  if (!expiryDate) return 'approved';
  const expiry = new Date(expiryDate);
  const daysUntilExpiry = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring';
  return 'approved';
}

export async function GET(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');

    const [volunteersRes, dogsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, first_name, last_name, email, vsc_document_url, vsc_date_issued, vsc_renewal_due, vsc_verification_status, vsc_verified_at, vsc_verified_by')
        .eq('role', 'volunteer')
        .eq('status', 'approved')
        .order('last_name', { ascending: true }),
      supabase
        .from('dogs')
        .select('volunteer_id, dog_name, dog_breed, vaccine_record_url, vaccine_date_issued, vaccine_expiry_date, vaccine_verification_status, vaccine_verified_at, vaccine_verified_by'),
    ]);

    if (volunteersRes.error) {
      console.error('[GET /api/admin/compliance] Supabase error:', volunteersRes.error);
      return NextResponse.json({ error: 'Failed to fetch compliance data' }, { status: 500 });
    }

    const volunteers = volunteersRes.data ?? [];
    const dogsByVolunteer = new Map((dogsRes.data ?? []).map(d => [d.volunteer_id, d]));

    const annotated = volunteers.map((v) => {
      const dog = dogsByVolunteer.get(v.id) ?? null;
      const vscStatus = getComplianceStatus(v.vsc_document_url, v.vsc_renewal_due, v.vsc_verification_status);
      const vaccineStatus = dog
        ? getComplianceStatus(dog.vaccine_record_url, dog.vaccine_expiry_date, dog.vaccine_verification_status)
        : 'missing';

      return {
        id: v.id,
        first_name: v.first_name,
        last_name: v.last_name,
        email: v.email,
        vsc: {
          status: vscStatus,
          document_url: v.vsc_document_url,
          date_issued: v.vsc_date_issued,
          renewal_due: v.vsc_renewal_due,
          verification_status: v.vsc_verification_status ?? null,
          verified_at: v.vsc_verified_at ?? null,
          verified_by: v.vsc_verified_by ?? null,
        },
        vaccine: {
          status: vaccineStatus,
          document_url: dog?.vaccine_record_url ?? null,
          date_issued: dog?.vaccine_date_issued ?? null,
          expiry_date: dog?.vaccine_expiry_date ?? null,
          dog_name: dog?.dog_name ?? null,
          verification_status: dog?.vaccine_verification_status ?? null,
          verified_at: dog?.vaccine_verified_at ?? null,
          verified_by: dog?.vaccine_verified_by ?? null,
        },
      };
    });

    // Optional filter by compliance status
    const filtered = statusFilter
      ? annotated.filter(v => v.vsc.status === statusFilter || v.vaccine.status === statusFilter)
      : annotated;

    return NextResponse.json({ volunteers: filtered });
  } catch (err: any) {
    console.error('[GET /api/admin/compliance] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
