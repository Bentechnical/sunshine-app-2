// POST /api/admin/invite-pd
// Creates a Clerk invitation for a new Program Director, then sends our own
// branded email via Resend (notify: false suppresses Clerk's generic email).

import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireAdmin } from '@/utils/requireAdmin';
import { sendTransactionalEmail } from '@/app/utils/mailer';

export async function POST(req: NextRequest) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  try {
    const body = await req.json();
    const { email, first_name } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const clerk = await clerkClient();

    // Revoke any existing pending invitation for this email before creating a new one.
    // This allows admins to resend without manual cleanup in the Clerk dashboard.
    const existingInvitations = await clerk.invitations.getInvitationList({ status: 'pending' });
    const existing = existingInvitations.data.find(
      (inv: any) => inv.emailAddress?.toLowerCase() === emailLower
    );
    if (existing) {
      await clerk.invitations.revokeInvitation(existing.id);
      console.log(`[invite-pd] Revoked existing pending invitation ${existing.id} for ${emailLower}`);
    }

    const invitation = await clerk.invitations.createInvitation({
      emailAddress: emailLower,
      publicMetadata: { role: 'pd' },
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.sunshinetherapydogs.com'}/dashboard`,
      notify: false, // We send our own branded email below
    });

    const inviteUrl = (invitation as any).url;
    if (!inviteUrl) {
      // Fallback: if Clerk doesn't return a URL, log and still return success
      // (the admin can resend manually if needed)
      console.warn('[invite-pd] No invitation URL returned by Clerk — email not sent');
      return NextResponse.json({ success: true, invitation_id: invitation.id, email: emailLower, email_sent: false });
    }

    await sendTransactionalEmail({
      to: emailLower,
      subject: "You've been invited as a Program Director — Sunshine Therapy Dogs",
      templateName: 'pdInvite',
      data: {
        firstName: first_name ?? null,
        inviteUrl,
        year: new Date().getFullYear(),
      },
    });

    console.log(`[invite-pd] Invitation created and email sent to ${emailLower} (ID: ${invitation.id})`);

    return NextResponse.json({
      success: true,
      invitation_id: invitation.id,
      email: emailLower,
      email_sent: true,
    });
  } catch (err: any) {
    if (err?.errors?.[0]?.code === 'duplicate_record') {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email address' },
        { status: 409 }
      );
    }
    console.error('[invite-pd] Error:', err?.errors ?? err?.message ?? err);
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
  }
}
