import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

type CheckSuccess = { userId: string; role: 'admin' | 'pd' };
type CheckError = { error: NextResponse };

/**
 * Verifies the caller is an authenticated admin or PD user.
 * Returns { userId, role } on success, or { error: NextResponse } to return immediately.
 *
 * Usage:
 *   const check = await requireAdminOrPd();
 *   if ('error' in check) return check.error;
 *   const { userId, role } = check;
 */
export async function requireAdminOrPd(): Promise<CheckSuccess | CheckError> {
  const { userId } = await auth();

  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const supabase = createSupabaseAdminClient();
  const { data: user, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !user || !['admin', 'pd'].includes(user.role)) {
    return { error: NextResponse.json({ error: 'Admin or PD access required' }, { status: 403 }) };
  }

  return { userId, role: user.role as 'admin' | 'pd' };
}
