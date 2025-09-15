// src/middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Clerk public routes
const isClerkPublicRoute = (path: string) =>
  path.startsWith('/sign-in') ||
  path.startsWith('/sign-up') ||
  path.startsWith('/sso-callback') ||
  path.startsWith('/oauth') ||
  path.startsWith('/api/clerk');

// Admin API routes that should be accessible to authenticated users
const isAdminApiRoute = (path: string) =>
  path.startsWith('/api/admin/');

// General API routes that should be accessible to authenticated users
const isApiRoute = (path:string) =>
  path.startsWith('/api/');

// Admin dashboard routes that should be accessible to authenticated admin users
const isAdminDashboardRoute = (path: string) =>
  path.startsWith('/dashboard/admin');

// Skip routes that shouldn't trigger middleware logic
const isBypassablePath = (path: string) =>
  isClerkPublicRoute(path) ||
  path.startsWith('/unlock') ||
  path.startsWith('/api/unlock') ||
  path.startsWith('/api/geocode') ||
  path.startsWith('/api/webhooks') ||
  path.startsWith('/api/chat/webhook') ||  // ✅ Stream Chat webhook (no auth needed)
  path.startsWith('/_next') ||             // ✅ Next.js assets (CSS, JS)
  path.startsWith('/favicon.ico') ||       // ✅ Favicon
  path.startsWith('/manifest.json') ||     // ✅ PWA Manifest (required for PWA functionality)
  path.startsWith('/web-app-manifest-') || // ✅ PWA Icons (required for PWA functionality)
  path.startsWith('/images') ||            // ✅ Your static image assets
  path.startsWith('/fonts') ||             // ✅ Fonts if used
  path.startsWith('/assets');              // ✅ Any other custom static paths

// Check if request is coming from ngrok (for testing purposes)
const isNgrokRequest = (req: NextRequest) => {
  const host = req.headers.get('host') || '';
  const referer = req.headers.get('referer') || '';
  const origin = req.headers.get('origin') || '';
  
  return host.includes('ngrok') || 
         referer.includes('ngrok') || 
         origin.includes('ngrok') ||
         host.includes('ngrok-free.app');
};

export const middleware = clerkMiddleware(async (auth, req: NextRequest) => {
  const { pathname } = req.nextUrl;
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) console.log('[Middleware] Path:', pathname);

  // Check for ngrok requests (for testing purposes)
  if (isDev && isNgrokRequest(req)) {
    console.log('[Middleware] Ngrok request detected, bypassing all checks for testing');
    return NextResponse.next();
  }

  if (isBypassablePath(pathname)) {
    return NextResponse.next();
  }

  // Allow admin API routes for authenticated users
  if (isAdminApiRoute(pathname)) {
    const { userId } = await auth();
    if (userId) {
      if (isDev) console.log('[Middleware] Admin API access granted for authenticated user:', userId);
      return NextResponse.next();
    } else {
      if (isDev) console.log('[Middleware] Admin API access denied - no authenticated user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Allow general API routes for authenticated users (no cookie required)
  if (isApiRoute(pathname)) {
    const { userId } = await auth();
    if (userId) {
      if (isDev) console.log('[Middleware] API access granted for authenticated user:', userId);
      return NextResponse.next();
    } else {
      if (isDev) console.log('[Middleware] API access denied - no authenticated user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Allow admin dashboard routes for authenticated users
  if (isAdminDashboardRoute(pathname)) {
    const { userId } = await auth();
    if (userId) {
      if (isDev) console.log('[Middleware] Admin dashboard access granted for authenticated user:', userId);
      return NextResponse.next();
    } else {
      if (isDev) console.log('[Middleware] Admin dashboard access denied - no authenticated user');
      const url = req.nextUrl.clone();
      url.pathname = '/sign-in';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!.*\\..*|_next).*)',
    '/',
    '/(api)(.*)',
  ],
};
