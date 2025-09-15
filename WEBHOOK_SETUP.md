# Stream Chat Webhook Setup Guide

## Why Webhooks Are Needed
Webhooks are required to save chat messages to your database. Without them:
- ❌ Chat logs won't be saved to `chat_logs` table
- ❌ Admin chat monitoring won't work
- ❌ Message history will be lost

## Setup Instructions

### Step 1: Get Your Webhook URL
Your webhook endpoint is: `https://yourdomain.com/api/chat/webhook`

### Step 2: Configure in Stream Chat Dashboard
1. Go to https://getstream.io/chat/dashboard/
2. Select your app
3. Navigate to **Chat** → **Webhooks**
4. Click **"Add Webhook"**
5. Configure:
   - **URL**: `https://yourdomain.com/api/chat/webhook`
   - **Events**: Check **"message.new"**
   - **Secret**: Leave empty for now (we'll add verification later)
6. Click **"Save"**

### Step 3: Test Webhook
1. Send a message in any appointment chat
2. Check your server logs for:
   ```
   [Stream Chat Webhook] Received event: message.new
   [Stream Chat Webhook] Successfully logged message
   ```

### Step 4: Verify Database
Check your `chat_logs` table for new entries after sending messages.

## Troubleshooting

**If webhook calls fail:**
- Ensure your domain is publicly accessible
- Check server logs for webhook reception
- Verify the webhook URL in Stream Chat dashboard

**If messages aren't logged:**
- Check the webhook payload in server logs
- Ensure `type: 'appointment_chat'` is set in channel custom data
- Verify database permissions for `chat_logs` table

## Debug Endpoints
- `/api/debug/stream-webhooks` - Shows webhook setup instructions
- `/api/debug/user-notifications` - Shows chat data and recent logs
- `/api/debug/stream-auth` - Tests Stream Chat authentication