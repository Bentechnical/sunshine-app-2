SUNSHINE THERAPY DOGS
You Have Unread Messages

Hi {{recipientName}},

{{#if (eq conversationCount 1)}}
You have {{conversations.0.messageCount}} unread message{{#if (gt conversations.0.messageCount 1)}}s{{/if}} from {{conversations.0.senderName}} about your upcoming appointment with {{conversations.0.dogName}}.

Appointment: {{conversations.0.appointmentTime}}

{{#if (eq conversations.0.messageCount 1)}}Latest message:{{else}}Messages:{{/if}}
"{{conversations.0.latestMessage}}"

View your message here:
{{appUrl}}/dashboard?tab=messages
{{else}}
You have unread messages in {{conversationCount}} conversations:

{{#each conversations}}
• {{this.senderName}} ({{this.dogName}})
  Appointment: {{this.appointmentTime}}
  {{this.messageCount}} new message{{#if (gt this.messageCount 1)}}s{{/if}}
  "{{this.latestMessage}}"

{{/each}}
View all messages here:
{{appUrl}}/dashboard?tab=messages
{{/if}}

---

💬 Reminder: Use the Messages tab in your dashboard to stay connected and coordinate details for your upcoming visit. Quick responses help ensure everything goes smoothly!

---

This email was sent from an unmonitored address. For support, please contact info@sunshinetherapydogs.ca

© {{year}} Sunshine Therapy Dogs. All rights reserved.
Visit our website: https://www.sunshinetherapydogs.ca
Contact Support: info@sunshinetherapydogs.ca
