import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateUserToken } from '@/utils/stream-chat';

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate Stream Chat token for the user
    const token = await generateUserToken(userId);

    return NextResponse.json({ token });
  } catch (error) {
    console.error('[Chat Token API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
} 