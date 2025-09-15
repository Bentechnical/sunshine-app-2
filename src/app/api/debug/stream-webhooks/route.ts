import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      note: 'Stream Chat webhook configuration must be done via Stream Chat dashboard',
      debug: {
        apiKey: process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY?.substring(0, 8) + '...',
        webhookEndpoint: `${request.nextUrl.origin}/api/chat/webhook`,
        hasSecret: !!process.env.STREAM_CHAT_SECRET,
        instructions: [
          '1. Go to https://getstream.io/chat/dashboard/',
          '2. Select your app',
          '3. Go to Chat → Webhooks',
          `4. Add webhook URL: ${request.nextUrl.origin}/api/chat/webhook`,
          '5. Enable "message.new" event',
          '6. Save configuration'
        ]
      }
    });

  } catch (error) {
    console.error('[Debug] Error in webhook debug endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}