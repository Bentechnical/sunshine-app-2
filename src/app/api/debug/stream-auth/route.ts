import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateUserToken } from '@/utils/stream-chat';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized - no Clerk user ID' }, { status: 401 });
    }

    // Test token generation
    try {
      const token = await generateUserToken(userId);

      return NextResponse.json({
        success: true,
        userId: userId,
        hasToken: !!token,
        tokenLength: token.length,
        tokenStart: token.substring(0, 10) + '...',
        debug: {
          hasStreamApiKey: !!process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY,
          hasStreamSecret: !!process.env.STREAM_CHAT_SECRET,
          apiKeyStart: process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY?.substring(0, 8) + '...'
        }
      });

    } catch (tokenError) {
      console.error('[Debug] Token generation error:', tokenError);
      return NextResponse.json({
        success: false,
        error: 'Token generation failed',
        tokenError: tokenError instanceof Error ? tokenError.message : 'Unknown token error',
        userId: userId,
        debug: {
          hasStreamApiKey: !!process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY,
          hasStreamSecret: !!process.env.STREAM_CHAT_SECRET,
          apiKeyStart: process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY?.substring(0, 8) + '...'
        }
      }, { status: 500 });
    }

  } catch (error) {
    console.error('[Debug] Auth debug error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}