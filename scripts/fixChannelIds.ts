import { createClient } from '@supabase/supabase-js';

function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function fixChannelIds() {
  const supabase = createSupabaseAdminClient();
  
  try {
    console.log('Starting channel ID fix...');
    
    // Get all appointment chats
    const { data: chats, error } = await supabase
      .from('appointment_chats')
      .select('*');
    
    if (error) {
      console.error('Error fetching chats:', error);
      return;
    }
    
    console.log(`Found ${chats?.length || 0} chats to process`);
    
    for (const chat of chats || []) {
      if (chat.stream_channel_id && chat.stream_channel_id.includes('messaging:')) {
        const newChannelId = chat.stream_channel_id.replace('messaging:', '');
        
        console.log(`Updating chat ${chat.id}: ${chat.stream_channel_id} -> ${newChannelId}`);
        
        const { error: updateError } = await supabase
          .from('appointment_chats')
          .update({ stream_channel_id: newChannelId })
          .eq('id', chat.id);
        
        if (updateError) {
          console.error(`Error updating chat ${chat.id}:`, updateError);
        } else {
          console.log(`Successfully updated chat ${chat.id}`);
        }
      }
    }
    
    console.log('Channel ID fix completed');
  } catch (error) {
    console.error('Error in fixChannelIds:', error);
  }
}

// Run the script
fixChannelIds()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  }); 