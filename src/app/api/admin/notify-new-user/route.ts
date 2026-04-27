// src/app/api/admin/notify-new-user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendTransactionalEmail } from '../../../utils/mailer';
import { requireAdmin } from '@/utils/requireAdmin';

export async function POST(req: NextRequest) {
  const check = await requireAdmin();
  if ('error' in check) return check.error;

  try {
    console.log('[notify-new-user] 📥 Received request');
    const body = await req.json();
    const { userName, userType } = body;

    console.log('[notify-new-user] Request data:', { userName, userType });

    if (!userName || !userType) {
      console.error('[notify-new-user] ❌ Missing required fields:', body);
      return NextResponse.json({ error: 'Missing userName or userType' }, { status: 400 });
    }

    // Only send notifications on production site
    const host = req.headers.get('host') || '';
    const isProduction = host === 'sunshinedogs.app' || host === 'www.sunshinedogs.app';

    if (!isProduction) {
      console.log('[notify-new-user] 🚫 Skipping notification - not production environment (host:', host, ')');
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'Not production environment',
        host
      });
    }

    // Get admin notification email(s) from environment variable
    const adminEmails = process.env.ADMIN_NOTIFICATION_EMAIL;

    if (!adminEmails) {
      console.error('[notify-new-user] ⚠️ ADMIN_NOTIFICATION_EMAIL not configured - skipping notification');
      return NextResponse.json({
        success: false,
        error: 'No admin emails configured',
        message: 'ADMIN_NOTIFICATION_EMAIL environment variable is not set'
      }, { status: 500 });
    }

    // Split by comma and trim whitespace
    const emailList = adminEmails.split(',').map(email => email.trim()).filter(Boolean);
    console.log('[notify-new-user] 📧 Target email(s):', emailList);

    if (emailList.length === 0) {
      console.error('[notify-new-user] ⚠️ No valid admin emails found after parsing');
      return NextResponse.json({
        success: false,
        error: 'No valid admin emails configured',
        message: 'ADMIN_NOTIFICATION_EMAIL is empty or invalid'
      }, { status: 500 });
    }

    // Format user type for display
    const formattedUserType = userType.charAt(0).toUpperCase() + userType.slice(1);

    console.log('[notify-new-user] 📤 Attempting to send email to all admins...');

    // Send a single email to all admin addresses to avoid rate limiting
    try {
      console.log(`[notify-new-user] 📨 Sending to ${emailList.length} recipient(s): ${emailList.join(', ')}`);

      await sendTransactionalEmail({
        to: emailList, // Send to all admins in one email
        subject: `Sunshine - New ${formattedUserType} Pending Review`,
        templateName: 'adminNewUserNotification',
        data: {
          userName,
          userType: formattedUserType,
          dashboardLink: 'https://sunshinedogs.app/dashboard/admin',
          year: new Date().getFullYear(),
        },
      });

      console.log(`[notify-new-user] ✅ Notification sent successfully to all admins for ${userName} (${userType})`);

      return NextResponse.json({
        success: true,
        emailsSent: emailList.length,
        recipients: emailList
      });
    } catch (emailError: any) {
      const errorMsg = emailError.message || String(emailError);
      console.error(`[notify-new-user] ❌ Failed to send notification:`, emailError);

      return NextResponse.json({
        success: false,
        error: 'Email notification failed',
        message: errorMsg,
        emailsSent: 0,
        recipients: emailList
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[notify-new-user] ❌ Unexpected error:', err);
    return NextResponse.json({
      success: false,
      error: 'Internal Server Error',
      message: err.message || String(err)
    }, { status: 500 });
  }
}