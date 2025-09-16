import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();

  console.log(`[Test Webhook] 🧪 ${timestamp} - Test webhook called from:`, {
    url: request.url,
    host: request.headers.get('host'),
    userAgent: request.headers.get('user-agent'),
    vercelId: request.headers.get('x-vercel-id'),
    timestamp
  });

  try {
    const body = await request.json();
    console.log(`[Test Webhook] 📝 ${timestamp} - Body:`, body);
  } catch (err) {
    console.log(`[Test Webhook] ⚠️ ${timestamp} - No JSON body`);
  }

  return NextResponse.json({
    success: true,
    message: 'Test webhook received successfully',
    timestamp,
    host: request.headers.get('host')
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    message: 'Test webhook endpoint is working',
    timestamp: new Date().toISOString(),
    host: request.headers.get('host')
  });
}