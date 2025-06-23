// src/app/api/unlock/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correct = process.env.NEXT_PUBLIC_SITE_PASSWORD;

  if (password === correct) {
    const res = NextResponse.redirect(new URL('/', req.url));
    res.cookies.set('access_granted', 'true', {
      path: '/',
      httpOnly: true,
      secure: true,
      maxAge: 60 * 60 * 24, // 1 day
    });
    return res;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
