// src/app/api/admin/notify-new-user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendTransactionalEmail } from '../../../utils/mailer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userName, userType } = body;

    if (!userName || !userType) {
      console.error('[notify-new-user] Missing required fields:', body);
      return NextResponse.json({ error: 'Missing userName or userType' }, { status: 400 });
    }

    // Get admin notification email(s) from environment variable
    const adminEmails = process.env.ADMIN_NOTIFICATION_EMAIL;

    if (!adminEmails) {
      console.warn('[notify-new-user] ADMIN_NOTIFICATION_EMAIL not configured - skipping notification');
      return NextResponse.json({
        success: true,
        message: 'No admin emails configured'
      });
    }

    // Split by comma and trim whitespace
    const emailList = adminEmails.split(',').map(email => email.trim()).filter(Boolean);

    if (emailList.length === 0) {
      console.warn('[notify-new-user] No valid admin emails found');
      return NextResponse.json({
        success: true,
        message: 'No valid admin emails configured'
      });
    }

    // Format user type for display
    const formattedUserType = userType.charAt(0).toUpperCase() + userType.slice(1);

    // Send email to each admin
    for (const email of emailList) {
      try {
        await sendTransactionalEmail({
          to: email,
          subject: `New ${formattedUserType} Registration - Action Required`,
          templateName: 'adminNewUserNotification',
          data: {
            userName,
            userType: formattedUserType,
            dashboardLink: 'https://sunshinedogs.app/dashboard/admin',
            year: new Date().getFullYear(),
          },
        });
        console.log(`[notify-new-user] Notification sent to ${email} for ${userName} (${userType})`);
      } catch (emailError) {
        console.error(`[notify-new-user] Failed to send to ${email}:`, emailError);
        // Continue sending to other admins even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      emailsSent: emailList.length
    });
  } catch (err: any) {
    console.error('[notify-new-user] Unexpected error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}