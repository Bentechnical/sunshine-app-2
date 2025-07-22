import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correct = process.env.SITE_PASSWORD;

  if (password === correct) {
    const res = NextResponse.redirect(new URL('/dashboard', req.url), 303);
    res.cookies.set('access_granted', 'true', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 1 day
    });
    return res;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
