import { getAppUrl } from '@/app/utils/getAppUrl';
import { sendTransactionalEmail } from '@/app/utils/mailer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { to, subject, templateName, data } = await req.json();

    if (!to || !subject || !templateName || !data) {
      return NextResponse.json(
        { success: false, error: 'Missing required email parameters.' },
        { status: 400 }
      );
    }

    // 🔗 Add dynamic dashboard link here
    const dashboardLink = `${getAppUrl()}/dashboard`;

    const enrichedData = {
      ...data,
      dashboardLink,
    };

    const response = await sendTransactionalEmail({
      to,
      subject,
      templateName,
      data: enrichedData,
    });

    return NextResponse.json({ success: true, response });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
