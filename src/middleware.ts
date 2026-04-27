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
  path.startsWith('/dashboard/admin') ||
  path.startsWith('/admin/support');

// Skip routes that shouldn't trigger middleware logic
const isBypassablePath = (path: string) =>
  isClerkPublicRoute(path) ||
  path.startsWith('/api/geocode') ||
  path.startsWith('/api/webhooks') ||
  path.startsWith('/api/chat/webhook') ||
  path.startsWith('/api/notifications/process-pending') ||
  path.startsWith('/api/cron/') ||
  path.startsWith('/api/auth/google-native') ||
  path.startsWith('/_next') ||
  path.startsWith('/favicon.ico') ||
  path.startsWith('/manifest.json') ||
  path.startsWith('/web-app-manifest-') ||
  path.startsWith('/images') ||
  path.startsWith('/fonts') ||
  path.startsWith('/assets');


export const middleware = clerkMiddleware(async (auth, req: NextRequest) => {
  const { pathname } = req.nextUrl;
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) console.log('[Middleware] Path:', pathname);

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
