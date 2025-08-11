import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use admin client to bypass RLS policies
    const supabase = createSupabaseAdminClient();

    // Check if user is admin
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || user?.role !== 'admin') {
      console.error('[Admin Chats API] User not admin:', { userId, role: user?.role, error: userError });
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) console.log('[Admin Chats API] Fetching chats for admin:', userId);

    // Get all appointment chats with appointment details
    const { data: chats, error: chatsError } = await supabase
      .from('appointment_chats')
      .select(`
        *,
        appointment:appointments (
          start_time,
          end_time,
          individual:users!appointments_individual_id_fkey (
            id,
            first_name,
            last_name
          ),
          volunteer:users!appointments_volunteer_id_fkey (
            id,
            first_name,
            last_name
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (chatsError) {
      console.error('[Admin Chats API] Error fetching chats:', chatsError);
      return NextResponse.json({ error: 'Failed to fetch chats' }, { status: 500 });
    }

    if (isDev) console.log('[Admin Chats API] Found chats:', chats?.length || 0);

    // Get dog details for each chat separately
    const chatsWithDogs = await Promise.all(
      (chats || []).map(async (chat) => {
        try {
          const { data: dogData, error: dogError } = await supabase
            .from('dogs')
            .select('dog_name')
            .eq('volunteer_id', chat.appointment.volunteer.id)
            .single();

          if (dogError && isDev) {
            console.error('[Admin Chats API] Error fetching dog for chat:', chat.id, dogError);
          }

          return {
            ...chat,
            appointment: {
              ...chat.appointment,
              dog: dogData ? { dog_name: dogData.dog_name } : { dog_name: 'Unknown Dog' }
            }
          };
        } catch (error) {
          if (isDev) console.error('[Admin Chats API] Error processing chat:', chat.id, error);
          return {
            ...chat,
            appointment: {
              ...chat.appointment,
              dog: { dog_name: 'Unknown Dog' }
            }
          };
        }
      })
    );

    // Get message counts and last message time for each chat
    const chatsWithCounts = await Promise.all(
      (chatsWithDogs || []).map(async (chat) => {
        try {
          // Get message count
          const { count: messageCount, error: countError } = await supabase
            .from('chat_logs')
            .select('*', { count: 'exact', head: true })
            .eq('appointment_id', chat.appointment_id);

          if (countError && isDev) {
            console.error('[Admin Chats API] Error counting messages for chat:', chat.id, countError);
          }

          // Get last message time
          const { data: lastMessage, error: lastMessageError } = await supabase
            .from('chat_logs')
            .select('created_at')
            .eq('appointment_id', chat.appointment_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastMessageError && lastMessageError.code !== 'PGRST116' && isDev) {
            console.error('[Admin Chats API] Error getting last message for chat:', chat.id, lastMessageError);
          }

          return {
            ...chat,
            message_count: messageCount || 0,
            last_message_at: lastMessage?.created_at || chat.created_at,
            unread_count: chat.unread_count || 0
          };
        } catch (error) {
          console.error('[Admin Chats API] Error processing chat data:', chat.id, error);
          return {
            ...chat,
            message_count: 0,
            last_message_at: chat.created_at
          };
        }
      })
    );

    if (isDev) console.log('[Admin Chats API] Returning chats with counts:', chatsWithCounts.length);

    return NextResponse.json({ 
      chats: chatsWithCounts,
      total: chatsWithCounts.length
    });

  } catch (error) {
    console.error('[Admin Chats API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chats' },
      { status: 500 }
    );
  }
} 