# Stream Chat Integration Setup Guide

## Overview
This guide will help you set up the Stream Chat integration for the Sunshine App. The chat feature allows users to communicate about their appointments through a secure, real-time messaging system.

## Prerequisites
- Stream Chat account (free tier available)
- Supabase project with admin access
- Environment variables configured

## Step 1: Stream Chat Setup

### 1.1 Create Stream Chat Account
1. Go to [Stream Chat](https://getstream.io/chat/) and sign up for a free account
2. Create a new app in the Stream dashboard
3. Note your API Key and Secret (you'll need these for environment variables)

### 1.2 Configure Stream Chat App
1. In your Stream dashboard, go to your app settings
2. Configure the following settings:
   - **App Type**: Messaging
   - **Environment**: Development (for testing)
   - **Webhook URL**: `https://your-domain.com/api/chat/webhook` (for production)
   - **Webhook Events**: Enable `message.new` events

### 1.3 Set Up Webhook (Production Only)
For production, you'll need to configure webhooks to log messages for admin audit:
1. In Stream dashboard, go to Webhooks section
2. Add webhook URL: `https://your-domain.com/api/chat/webhook`
3. Select events: `message.new`
4. Save the webhook configuration

## Step 2: Environment Variables

Add these variables to your `.env.local` file:

```bash
# Stream Chat Configuration
NEXT_PUBLIC_STREAM_CHAT_API_KEY=your_stream_chat_api_key_here
STREAM_CHAT_SECRET=your_stream_chat_secret_here
NEXT_PUBLIC_APP_URL=https://sunshinedogs.app
```

## Step 3: Database Migration

Run the SQL commands from `DATABASE_MIGRATION_CHAT.md` in your Supabase SQL Editor:

1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Copy and paste the SQL commands from `DATABASE_MIGRATION_CHAT.md`
4. Execute the commands

## Step 4: Install Dependencies

The required dependencies have already been installed:
- `stream-chat` - Stream Chat JavaScript SDK
- `stream-chat-react` - React components for Stream Chat

## Step 5: Test the Integration

### 5.1 Test Chat Creation
1. Create a test appointment in your app
2. Confirm the appointment (this should trigger chat creation)
3. Check the Stream Chat dashboard to see if a channel was created
4. Verify the initial bot message was sent

### 5.2 Test User Chat Interface
1. Log in as a user with a confirmed appointment
2. Navigate to the Messages tab
3. Verify you can see your active chat
4. Test sending and receiving messages

### 5.3 Test Admin Interface
1. Log in as an admin
2. Navigate to Chat Management tab
3. Verify you can see all active chats
4. Test viewing chat logs

### 5.4 Test Connection Management
1. Run `npm run monitor-chat` to check connection status
2. Test user sign out to verify connections are properly closed
3. Monitor Stream Chat dashboard for connection patterns
4. Verify no duplicate connections are created for the same user

## Step 6: Production Deployment

### 6.1 Environment Variables
Ensure your production environment has the correct Stream Chat credentials:
- `NEXT_PUBLIC_STREAM_CHAT_API_KEY`
- `STREAM_CHAT_SECRET`
- `NEXT_PUBLIC_APP_URL=https://sunshinedogs.app`
- `BASE_URL=https://sunshinedogs.app`

### 6.2 Webhook Configuration
1. Update your Stream Chat webhook URL to your production domain
2. Test the webhook endpoint
3. Verify message logging is working

### 6.3 Automated Chat Closure
Set up a cron job or scheduled task to run the chat closure script:

```bash
# Run every hour to close expired chats
0 * * * * cd /path/to/your/app && npm run close-chats
```

## Step 7: Monitoring and Maintenance

### 7.1 Connection Monitoring
Use the provided monitoring tools to track Stream Chat usage:

```bash
# Monitor current usage and connections
npm run monitor-chat

# Test chat creation and connections
npm run test-chat

# Close expired chats
npm run close-chats
```

### 7.2 Usage Optimization
- Monitor your Stream Chat dashboard for MAU and concurrent connection metrics
- Use the connection management system to minimize unnecessary connections
- Review connection patterns to optimize usage costs

### 7.3 Troubleshooting
- Check `STREAM_CHAT_CONNECTION_MANAGEMENT.md` for connection management details
- Use `npm run monitor-chat` to diagnose connection issues
- Review browser console for any Stream Chat errors
- Verify environment variables are correctly set

Add this script to your `package.json`:
```json
{
  "scripts": {
    "close-chats": "tsx scripts/closeExpiredChats.ts"
  }
}
```

## Features Implemented

### ✅ Core Chat Functionality
- Real-time messaging between appointment participants
- Automatic chat creation when appointments are confirmed
- Chat closure 6 hours after appointment start time
- Initial bot message with appointment details

### ✅ User Interface
- Modern chat interface using Stream Chat React components
- Conversation list showing active appointments
- Message history and real-time updates
- Mobile-responsive design

### ✅ Admin Features
- Admin dashboard for viewing all chats
- Chat audit logs for compliance
- Search and filter functionality
- Message history for each appointment

### ✅ Security & Privacy
- Row Level Security (RLS) policies
- Users can only see chats for their appointments
- Admin access for oversight without user visibility
- Secure token generation for Stream Chat

### ✅ Integration
- Automatic chat creation on appointment confirmation
- Email notifications still work alongside chat
- Database tracking of chat channels and logs
- Webhook integration for message logging

## Troubleshooting

### Common Issues

1. **Chat not appearing after appointment confirmation**
   - Check browser console for errors
   - Verify Stream Chat API credentials
   - Check appointment status is 'confirmed'

2. **Messages not sending**
   - Verify user token generation
   - Check Stream Chat connection
   - Ensure user is connected to Stream Chat

3. **Admin can't see chats**
   - Verify admin role in database
   - Check RLS policies
   - Ensure admin API routes are working

4. **Webhook not receiving events**
   - Verify webhook URL is correct
   - Check webhook signature verification
   - Ensure webhook endpoint is accessible

### Debug Commands

```bash
# Test Stream Chat connection
npm run test-stream-chat

# Check database tables
npm run check-chat-tables

# Manually close expired chats
npm run close-chats
```

## Support

For issues with:
- **Stream Chat**: Contact Stream support or check their documentation
- **App Integration**: Check the browser console and server logs
- **Database**: Verify RLS policies and table structure

## Next Steps

1. **Push Notifications**: Configure mobile push notifications
2. **File Sharing**: Enable image/file sharing in messages
3. **Message Templates**: Add predefined message templates
4. **Analytics**: Track chat usage and engagement metrics
5. **Moderation**: Add automated content filtering

---

**Note**: This implementation provides a solid foundation for chat functionality. The system is designed to be scalable and can be extended with additional features as needed. 