import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correct = process.env.SITE_PASSWORD;

  if (password === correct) {
    // Return JSON instead of redirect to ensure Safari/iOS reliably stores Set-Cookie from fetch responses
    const res = NextResponse.json({ ok: true });
    // Dev-only relaxations to avoid iOS Simulator/Safari cookie quirks on localhost.
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookies.set('access_granted', 'true', {
      path: '/',
      httpOnly: isProduction ? true : false,
      secure: isProduction ? true : false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 day
    });
    return res;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
