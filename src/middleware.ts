// src/middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PASSWORD_COOKIE = 'access_granted';
const PASSWORD_COOKIE_VALUE = 'true';

const isClerkPublicRoute = (path: string) =>
  path.startsWith('/sign-in') ||
  path.startsWith('/sign-up') ||
  path.startsWith('/sso-callback') ||
  path.startsWith('/oauth') ||
  path.startsWith('/api/clerk');

const isBypassablePath = (path: string) =>
  isClerkPublicRoute(path) || path.startsWith('/unlock') || path.startsWith('/api/unlock');

export default clerkMiddleware((auth, req: NextRequest) => {
  const { pathname } = req.nextUrl;
  const cookie = req.cookies.get(PASSWORD_COOKIE);

  // Allow bypassable routes through
  if (isBypassablePath(pathname)) {
    return NextResponse.next();
  }

  // If password cookie not set, redirect to /unlock
  if (!cookie || cookie.value !== PASSWORD_COOKIE_VALUE) {
    const url = req.nextUrl.clone();
    url.pathname = '/unlock';
    return NextResponse.redirect(url);
  }

  // Continue with Clerk-protected routes
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
