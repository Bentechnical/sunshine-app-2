import { NextRequest, NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';

const WEB_CLIENT_ID = '142761696447-2gervhsatt4eme82dblrsodg9luvnn1q.apps.googleusercontent.com';
const ANDROID_CLIENT_ID = '142761696447-au3r05jvvm94rkijvb215vlj094hag2e.apps.googleusercontent.com';

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 });
    }

    // Verify the Google ID token
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    const tokenInfo = await tokenInfoRes.json();

    if (!tokenInfoRes.ok || tokenInfo.error) {
      console.error('[google-native] Token verification failed:', tokenInfo);
      return NextResponse.json({ error: 'Invalid Google token' }, { status: 401 });
    }

    // Verify audience and issuer
    const validAudiences = [WEB_CLIENT_ID, ANDROID_CLIENT_ID];
    if (!validAudiences.includes(tokenInfo.aud)) {
      console.error('[google-native] Invalid audience:', tokenInfo.aud);
      return NextResponse.json({ error: 'Invalid token audience' }, { status: 401 });
    }

    const { email, sub: googleId, given_name, family_name } = tokenInfo;
    if (!email) {
      return NextResponse.json({ error: 'No email in token' }, { status: 401 });
    }

    const clerk = await clerkClient();

    // Find existing user by email
    const { data: users } = await clerk.users.getUserList({ emailAddress: [email] });
    let user = users[0];

    // Create user if they don't exist
    if (!user) {
      console.log('[google-native] Creating new Clerk user for:', email);
      user = await clerk.users.createUser({
        emailAddress: [email],
        firstName: given_name || undefined,
        lastName: family_name || undefined,
        externalId: googleId,
        skipPasswordRequirement: true,
      });
    }

    // Issue a short-lived sign-in token
    const signInToken = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 60,
    });

    return NextResponse.json({ token: signInToken.token });
  } catch (err: any) {
    console.error('[google-native] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
