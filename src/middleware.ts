// src/middleware.ts
import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const isClerkPublicRoute = (path: string) =>
  path.startsWith('/sign-in') ||
  path.startsWith('/sign-up') ||
  path.startsWith('/sso-callback') ||
  path.startsWith('/oauth') ||
  path.startsWith('/api/clerk');

export default clerkMiddleware((auth, req: NextRequest) => {
  const { pathname } = req.nextUrl;

  // Allow Clerk routes to continue unmodified
  if (isClerkPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Otherwise, proceed with default Clerk auth
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
