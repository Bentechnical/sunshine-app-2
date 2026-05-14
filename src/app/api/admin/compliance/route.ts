// GET /api/admin/compliance
// List all volunteers with their VSC and vaccine compliance status.
// Query params: status (missing|uploaded|expiring|expired — filters by overall compliance state)

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrPd } from '@/utils/requireAdminOrPd';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

function getComplianceStatus(documentUrl: string | null, expiryDate: string | null): 'missing' | 'uploaded' | 'expiring' | 'expired' {
  if (!documentUrl) return 'missing';
  if (!expiryDate) return 'uploaded';

  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring';
  return 'uploaded';
}

export async function GET(req: NextRequest) {
  const check = await requireAdminOrPd();
  if ('error' in check) return check.error;

  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');

    const { data: volunteers, error } = await supabase
      .from('users')
      .select(`
        id, first_name, last_name, email,
        vsc_document_url, vsc_date_issued, vsc_renewal_due,
        dogs(id, dog_name, dog_breed, vaccine_record_url, vaccine_expiry_date)
      `)
      .eq('role', 'volunteer')
      .eq('status', 'approved')
      .order('last_name', { ascending: true });

    if (error) {
      console.error('[GET /api/admin/compliance] Supabase error:', error);
      return NextResponse.json({ error: 'Failed to fetch compliance data' }, { status: 500 });
    }

    const annotated = (volunteers ?? []).map((v) => {
      const dog = (v.dogs as any[])?.[0] ?? null;
      const vscStatus = getComplianceStatus(v.vsc_document_url, v.vsc_renewal_due);
      const vaccineStatus = dog
        ? getComplianceStatus(dog.vaccine_record_url, dog.vaccine_expiry_date)
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
        },
        vaccine: {
          status: vaccineStatus,
          document_url: dog?.vaccine_record_url ?? null,
          expiry_date: dog?.vaccine_expiry_date ?? null,
          dog_name: dog?.dog_name ?? null,
        },
      };
    });

    // Optional filter by compliance status
    const filtered = statusFilter
      ? annotated.filter(
          (v) => v.vsc.status === statusFilter || v.vaccine.status === statusFilter
        )
      : annotated;

    return NextResponse.json({ volunteers: filtered });
  } catch (err: any) {
    console.error('[GET /api/admin/compliance] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
