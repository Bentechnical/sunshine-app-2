import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

type AdminCheckSuccess = { userId: string };
type AdminCheckError = { error: NextResponse };

/**
 * Verifies the caller is an authenticated admin user.
 * Returns { userId } on success, or { error: NextResponse } to return immediately.
 *
 * Usage:
 *   const check = await requireAdmin();
 *   if ('error' in check) return check.error;
 *   const { userId } = check;
 */
export async function requireAdmin(): Promise<AdminCheckSuccess | AdminCheckError> {
  const { userId } = await auth();

  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabase = createSupabaseAdminClient();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (userError || user?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }

  return { userId };
}
