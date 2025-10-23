import { StreamChat } from 'stream-chat';
import { formatEmailDateTime, getAppointmentDuration } from './dateUtils';

// Stream Chat configuration
export const STREAM_CHAT_API_KEY = process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY!;
export const STREAM_CHAT_SECRET = process.env.STREAM_CHAT_SECRET!;

// Initialize Stream Chat client (server-side)
export const streamChatServer = StreamChat.getInstance(
  STREAM_CHAT_API_KEY,
  STREAM_CHAT_SECRET
);

// Initialize Stream Chat client (client-side)
export const streamChatClient = StreamChat.getInstance(STREAM_CHAT_API_KEY);

// Helper function to generate user token
export async function generateUserToken(userId: string): Promise<string> {
  return streamChatServer.createToken(userId);
}

// Helper function to create a chat channel for an appointment
export async function createAppointmentChat(
  appointmentId: number,
  individualId: string,
  volunteerId: string,
  appointmentDetails: {
    startTime: string;
    endTime: string;
    dogName: string;
    individualName: string;
    volunteerName: string;
    location: string;
    individualBio: string;
  }
) {
  const channelId = `appointment-${appointmentId}`;
  
  // Create the channel
  // NOTE: Do NOT include created_by_id in channel data - it's a server-only field
  // that causes client-side operations to fail with "server side auth" errors
  const channel = streamChatServer.channel('messaging', channelId, {
    members: [individualId, volunteerId],
    ...{
      custom: {
        appointment_id: appointmentId,
        appointment_start_time: appointmentDetails.startTime,
        appointment_end_time: appointmentDetails.endTime,
        dog_name: appointmentDetails.dogName,
        individual_name: appointmentDetails.individualName,
        volunteer_name: appointmentDetails.volunteerName,
        location: appointmentDetails.location,
        type: 'appointment_chat'
      }
    } as any
  });

  await channel.create();

  // Send initial bot message using clean date-fns formatting
  const formattedDateTime = formatEmailDateTime(appointmentDetails.startTime);
  const durationText = getAppointmentDuration(appointmentDetails.startTime, appointmentDetails.endTime);

  const botMessage = {
    text: `Welcome to your appointment chat! 🐕

**Appointment Details:**
• **Date & Time:** ${formattedDateTime}
• **Duration:** Maximum ${durationText}
• **Dog:** ${appointmentDetails.dogName}
• **Location:** ${appointmentDetails.location}
${appointmentDetails.individualBio ? `• **Reason for visit:** ${appointmentDetails.individualBio}` : ''}

**Important Information:**
• Please arrive 5-10 minutes early to your appointment
• Use this chat to coordinate any last-minute details
• If you can no longer make it, please cancel through the **My Visits** tab as soon as possible
• This chat will automatically close 6 hours after your appointment begins

**For Future Visits:**
• To book a follow-up appointment, please submit a new visit request through the app

**Questions or Concerns?**
• Contact us anytime at **info@sunshinetherapydogs.ca**

We hope you have a wonderful visit together!`,
    user_id: 'system'
  };

  await channel.sendMessage(botMessage);

  return channel;
}

// Helper function to close a chat channel
export async function closeAppointmentChat(appointmentId: number) {
  const channelId = `appointment-${appointmentId}`;
  const channel = streamChatServer.channel('messaging', channelId);
  
  // Send closing message
  await channel.sendMessage({
    text: 'This chat has been closed as your appointment has concluded. Thank you for using Sunshine App! 🌟',
    user_id: 'system'
  });

  // Archive the channel
  await channel.update({ status: 'closed' } as any);
}

// Helper function to get user's active chats
export async function getUserChats(userId: string) {
  const filter = { members: { $in: [userId] } };
  const sort = [{ last_message_at: -1 }];
  
  const channels = await streamChatServer.queryChannels(filter, sort, {
    state: true,
    watch: true,
  });

  return channels.filter(channel => 
    (channel.data as any)?.custom?.type === 'appointment_chat' && 
    (channel.data as any)?.status !== 'closed'
  );
}

// Helper function to get all appointment chats (for admin)
export async function getAllAppointmentChats() {
  const filter = { custom: { type: 'appointment_chat' } } as any;
  const sort = [{ last_message_at: -1 }];
  
  return await streamChatServer.queryChannels(filter, sort, {
    state: false,
    watch: false,
  });
} 