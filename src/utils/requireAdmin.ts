import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

type AdminCheckSuccess = { userId: string };
type AdminCheckError = { error: NextResponse };

/**
 * Verifies the caller is an authenticated admin user.
 * Reads role from Clerk publicMetadata (JWT) — no DB call required.
 * Returns { userId } on success, or { error: NextResponse } to return immediately.
 *
 * Usage:
 *   const check = await requireAdmin();
 *   if ('error' in check) return check.error;
 *   const { userId } = check;
 */
export async function requireAdmin(): Promise<AdminCheckSuccess | AdminCheckError> {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const role = (sessionClaims?.metadata as { role?: string })?.role;
  if (role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
  }

  return { userId };
}
