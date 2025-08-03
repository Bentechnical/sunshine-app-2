import { NextRequest, NextResponse } from 'next/server';
import { closeExpiredChats } from '@/utils/closeExpiredChats';

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Cron] Starting expired chat cleanup...');
    const result = await closeExpiredChats();
    
    console.log('[Cron] Expired chat cleanup completed:', result);
    return NextResponse.json({ 
      success: true, 
      message: 'Expired chats closed successfully',
      result 
    });

  } catch (error) {
    console.error('[Cron] Error closing expired chats:', error);
    return NextResponse.json(
      { error: 'Failed to close expired chats' },
      { status: 500 }
    );
  }
} 