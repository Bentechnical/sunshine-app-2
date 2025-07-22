// src/middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PASSWORD_COOKIE = 'access_granted';
const PASSWORD_COOKIE_VALUE = 'true';

// Clerk public routes
const isClerkPublicRoute = (path: string) =>
  path.startsWith('/sign-in') ||
  path.startsWith('/sign-up') ||
  path.startsWith('/sso-callback') ||
  path.startsWith('/oauth') ||
  path.startsWith('/api/clerk');

// Skip routes that shouldn't trigger middleware logic
const isBypassablePath = (path: string) =>
  isClerkPublicRoute(path) ||
  path.startsWith('/unlock') ||
  path.startsWith('/api/unlock') ||
  path.startsWith('/api/geocode') ||
  path.startsWith('/api/webhooks') ||
  path.startsWith('/_next') ||             // ✅ Next.js assets (CSS, JS)
  path.startsWith('/favicon.ico') ||       // ✅ Favicon
  path.startsWith('/images') ||            // ✅ Your static image assets
  path.startsWith('/fonts') ||             // ✅ Fonts if used
  path.startsWith('/assets');              // ✅ Any other custom static paths

export const middleware = clerkMiddleware(async (_auth, req: NextRequest) => {
  const { pathname } = req.nextUrl;
  console.log('[Middleware] Path:', pathname);

  if (isBypassablePath(pathname)) {
    return NextResponse.next();
  }

  // Check cookie for access gating
  const cookie = req.cookies.get(PASSWORD_COOKIE);
  if (!cookie || cookie.value !== PASSWORD_COOKIE_VALUE) {
    console.log('[Middleware] Missing or invalid cookie. Redirecting to /unlock');
    const url = req.nextUrl.clone();
    url.pathname = '/unlock';
    return NextResponse.redirect(url);
    
  }

  return NextResponse.next();
});
