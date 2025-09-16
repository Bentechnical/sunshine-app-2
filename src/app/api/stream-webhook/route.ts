import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();

  console.log(`[DEBUG WEBHOOK] 🚨 ${timestamp} - Wrong webhook URL called!`, {
    url: request.url,
    pathname: new URL(request.url).pathname,
    host: request.headers.get('host'),
    userAgent: request.headers.get('user-agent'),
    correctUrl: '/api/chat/webhook'
  });

  try {
    const payload = await request.json();
    console.log(`[DEBUG WEBHOOK] 📝 ${timestamp} - Payload:`, {
      type: payload.type,
      messageId: payload.message?.id,
      channelId: payload.channel?.id
    });
  } catch (err) {
    console.log(`[DEBUG WEBHOOK] ❌ ${timestamp} - Failed to parse JSON:`, err);
  }

  return NextResponse.json({
    error: 'Wrong webhook URL',
    message: 'This webhook was called at /api/stream-webhook but should be /api/chat/webhook',
    correctUrl: '/api/chat/webhook',
    timestamp
  }, { status: 400 });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    error: 'Wrong webhook URL',
    message: 'Stream Chat webhook should be configured to /api/chat/webhook not /api/stream-webhook',
    correctUrl: '/api/chat/webhook'
  });
}