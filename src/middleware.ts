// src/middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const PASSWORD_COOKIE = 'access_granted';
const PASSWORD_COOKIE_VALUE = 'true';

const isClerkPublicRoute = (path: string) =>
  path.startsWith('/sign-in') ||
  path.startsWith('/sign-up') ||
  path.startsWith('/sso-callback') ||
  path.startsWith('/oauth') ||
  path.startsWith('/api/clerk');

const isBypassablePath = (path: string) =>
  isClerkPublicRoute(path) ||
  path.startsWith('/unlock') ||
  path.startsWith('/api/unlock') ||
  path.startsWith('/api/geocode') ||
  path.startsWith('/api/webhooks'); // ✅ Allow Clerk webhooks to bypass

export const middleware = clerkMiddleware((auth, req: NextRequest) => {
  const { pathname } = req.nextUrl;

  if (isBypassablePath(pathname)) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(PASSWORD_COOKIE);
  if (!cookie || cookie.value !== PASSWORD_COOKIE_VALUE) {
    const url = req.nextUrl.clone();
    url.pathname = '/unlock';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next|.*\\.(?:js|css|svg|png|jpg|jpeg|ico|woff2?|ttf|map)).*)'],
};
