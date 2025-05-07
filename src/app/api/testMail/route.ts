// src/app/api/testMail/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendTransactionalEmail } from '../../utils/mailer';

export async function POST(req: NextRequest) {
  try {
    // Expecting a JSON payload with { to, subject, templateName, data }
    const { to, subject, templateName, data } = await req.json();
    
    // Make sure all required fields are provided
    if (!to || !subject || !templateName || !data) {
      return NextResponse.json(
        { success: false, error: 'Missing required email parameters.' },
        { status: 400 }
      );
    }

    const response = await sendTransactionalEmail({ to, subject, templateName, data });
    return NextResponse.json({ success: true, response });
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) errorMessage = error.message;
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
