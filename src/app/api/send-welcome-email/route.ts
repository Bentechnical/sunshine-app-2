// src/app/api/send-welcome-email/route.ts
import { NextResponse } from 'next/server';
import { sendTransactionalEmail } from '../../utils/mailer';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, firstName } = body;

    if (!email) {
      console.error('[send-welcome-email] Missing email');
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    await sendTransactionalEmail({
      to: email,
      subject: 'Welcome to Sunshine Therapy Dogs!',
      templateName: 'welcome',
      data: {
        firstName: firstName || 'there',
        year: new Date().getFullYear(),
      },
    });

    console.log(`[send-welcome-email] Welcome email sent to ${email}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[send-welcome-email] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
