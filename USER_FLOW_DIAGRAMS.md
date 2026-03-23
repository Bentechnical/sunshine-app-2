# Sunshine App Redesign: User Flow Diagrams
**Visual Guide for Team Meeting & Design Mockups**

---

## Overview

This document provides detailed user flow diagrams that can be used to:
1. Create visual mockups in Figma/Sketch/other design tools
2. Explain the redesign to stakeholders
3. Guide development implementation

**Suggested Tools for Creating Mockups:**
- **Figma** (free, collaborative, web-based) - RECOMMENDED
- **Excalidraw** (free, simple, good for quick wireframes)
- **Whimsical** (good for flow diagrams)
- **Miro** (collaborative whiteboard)

---

## Flow 1: Individual Books Appointment (Complete Journey)

### Overview
Individual discovers dog → sends chat request → coordinates time → schedules appointment

---

### Detailed Steps with Screen Descriptions

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: Individual Browses Dogs                              │
│ Page: /dashboard/dogs (or "Connect with Dogs" tab)          │
└──────────────────────────────────────────────────────────────┘

Screen Layout:
┌─────────────────────────────────────────────────────────────┐
│ Sunshine App                          [Profile ▼] [Messages]│
├─────────────────────────────────────────────────────────────┤
│ Navigation: [Home] [Connect with Dogs] [My Visits] ...      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Connect with Dogs                    [Filter: 50km ▼]      │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │ 🐕            │  │ 🐕            │  │ 🐕            │  │
│  │  Buddy        │  │  Max          │  │  Luna         │  │
│  │               │  │               │  │               │  │
│  │ Golden Retriever│ │ Lab Mix      │  │ Border Collie │  │
│  │ 3 years old   │  │ 5 years old   │  │ 2 years old   │  │
│  │               │  │               │  │               │  │
│  │ with Sarah J. │  │ with Mike T.  │  │ with Lisa K.  │  │
│  │ 📍 5km away   │  │ 📍 8km away   │  │ 📍 12km away  │  │
│  │               │  │               │  │               │  │
│  │ 🕐 Usually free:│ │ 🕐 Usually free:│ │ 🕐 Usually free:│
│  │ Weekends &    │  │ Weekday       │  │ Flexible,     │  │
│  │ Thu afternoons│  │ evenings      │  │ message me    │  │
│  │               │  │               │  │               │  │
│  │ [Request Chat]│  │ [Request Chat]│  │ [Request Chat]│  │
│  └───────────────┘  └───────────────┘  └───────────────┘  │
│                                                              │
│  (More dogs below...)                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Grid layout: 3 columns on desktop, 2 on tablet, 1 on mobile
- Dog photo prominent at top of card
- Distance badge visible
- General availability text makes volunteer seem approachable
- "Request Chat" button is primary CTA (blue/green color)

User Action: Individual clicks [Request Chat] on Buddy's card
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: Chat Request Sent (Modal)                            │
│ Component: ChatRequestModal                                   │
└──────────────────────────────────────────────────────────────┘

Screen Layout (Modal overlay):
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│            ┌───────────────────────────────┐                │
│            │  ✉️ Chat Request Sent!        │                │
│            ├───────────────────────────────┤                │
│            │                               │                │
│            │  Your request to chat with    │                │
│            │  Sarah about meeting Buddy    │                │
│            │  has been sent.               │                │
│            │                               │                │
│            │  You'll receive a notification│                │
│            │  when Sarah accepts.          │                │
│            │                               │                │
│            │  Expected response time:      │                │
│            │  Within 24 hours              │                │
│            │                               │                │
│            │         [Got it!]             │                │
│            │                               │                │
│            └───────────────────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Simultaneously:
- Email sent to Sarah: "John Smith wants to connect with you"
- In-app notification badge appears on Sarah's dashboard

User Action: Individual clicks [Got it!] and waits
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: Volunteer Receives Notification                      │
│ Sarah's Perspective                                           │
└──────────────────────────────────────────────────────────────┘

Email (Sarah receives):
┌─────────────────────────────────────────────────────────────┐
│ From: Sunshine App <notifications@sunshineapp.com>          │
│ To: sarah@example.com                                        │
│ Subject: John Smith wants to connect with you                │
│                                                              │
│ Hi Sarah,                                                    │
│                                                              │
│ John Smith would like to chat with you about meeting Buddy! │
│                                                              │
│ About John:                                                  │
│ • Name: John M.                                              │
│ • Location: Toronto, ON (5km from you)                       │
│ • Bio: "Looking for weekly visits for my elderly mother..." │
│                                                              │
│ [Accept Request]  [View Full Profile]  [Decline]            │
│                                                              │
│ You can also respond in your dashboard.                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘

In-App Notification (Sarah's dashboard):
┌─────────────────────────────────────────────────────────────┐
│ Sunshine App                    [Profile ▼] [Messages (1•)] │
├─────────────────────────────────────────────────────────────┤
│ Dashboard Home                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ⚠️ Pending Requests (1)                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Chat Requests (1)                                     │  │
│  │                                                       │  │
│  │ 👤 John M. wants to chat about meeting Buddy         │  │
│  │    Toronto, ON • 5km away                            │  │
│  │    "Looking for weekly visits for my elderly..."     │  │
│  │                                                       │  │
│  │    [Accept Request]  [View Profile]  [Decline]       │  │
│  │                                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘

User Action: Sarah clicks [Accept Request]
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 4: Chat Opens with Welcome Message                      │
│ Page: /dashboard/messaging?channel=buddy-john-12345          │
└──────────────────────────────────────────────────────────────┘

Screen Layout (Both users now see this):
┌─────────────────────────────────────────────────────────────┐
│ Sunshine App                          [Profile ▼] [Messages]│
├─────────────────────────────────────────────────────────────┤
│ Messaging                                                    │
├──────────┬──────────────────────────────────────────────────┤
│ Chats    │ Chat with Sarah & Buddy                          │
│          │                                                   │
│ • Sarah  │ ┌──────────────────────────────────────────────┐│
│   & Buddy│ │ [System Message - Auto-sent]                 ││
│   (NEW!) │ │                                              ││
│          │ │ 👋 Great! You're now connected.              ││
│          │ │                                              ││
│          │ │ When you're ready to schedule a visit,       ││
│          │ │ use the button below.                        ││
│          │ └──────────────────────────────────────────────┘│
│          │                                                   │
│          │ ┌──────────────────────────────────────────────┐│
│          │ │     📅 Schedule Appointment                  ││
│          │ └──────────────────────────────────────────────┘│
│          │                                                   │
│          │ John: Hi Sarah! Thanks for accepting. I'm       │
│          │       looking for someone to visit my mom       │
│          │       who has Alzheimer's. Buddy looks perfect! │
│          │       Are you available this weekend?           │
│          │                                                   │
│          │ Sarah: Hi John! I'd love to help. Yes, I'm      │
│          │        free Saturday afternoon. What time       │
│          │        works for you?                           │
│          │                                                   │
│          │ John: How about 2pm?                            │
│          │                                                   │
│          │ Sarah: Perfect! Let's make it official 😊       │
│          │                                                   │
│          │ ┌────────────────────────────────────────────┐  │
│          │ │ [Type your message...]          [Send]    │  │
│          │ └────────────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────────────┘

Design Notes:
- "Schedule Appointment" button is prominent (always visible at top)
- System message provides guidance
- Chat is familiar (like iMessage/WhatsApp)
- Natural conversation about logistics

User Action: Either user clicks [Schedule Appointment]
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 5: Schedule Appointment Wizard - Step 1 (Date & Time)  │
│ Component: ScheduleAppointmentModal (Step 1/3)               │
└──────────────────────────────────────────────────────────────┘

Modal Layout:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│     ┌─────────────────────────────────────────────────┐    │
│     │ Schedule Appointment                      (1/3) │    │
│     ├─────────────────────────────────────────────────┤    │
│     │                                                 │    │
│     │ Date *                                          │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ [📅 Saturday, February 4, 2026      ▼]     ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │ (Calendar picker dropdown)                      │    │
│     │                                                 │    │
│     │ Start Time *                                    │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ [🕐 2:00 PM                          ▼]     ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │ Options: 9:00 AM - 8:00 PM (15-min increments) │    │
│     │                                                 │    │
│     │ Duration *                                      │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ [⏱️ 1 hour                           ▼]     ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │ Options: 30 min, 1 hour, 1.5 hours, 2 hours,   │    │
│     │          3 hours                                │    │
│     │                                                 │    │
│     │                       [Cancel]    [Next →]     │    │
│     └─────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Validation:
- Date must be in future (past dates disabled in picker)
- All fields required (Next button disabled if incomplete)

User Action: Fills fields, clicks [Next →]
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 6: Schedule Appointment Wizard - Step 2 (Location)     │
│ Component: ScheduleAppointmentModal (Step 2/3)               │
└──────────────────────────────────────────────────────────────┘

Modal Layout:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│     ┌─────────────────────────────────────────────────┐    │
│     │ Schedule Appointment                      (2/3) │    │
│     ├─────────────────────────────────────────────────┤    │
│     │                                                 │    │
│     │ Where will you meet? *                          │    │
│     │                                                 │    │
│     │ ○ Individual's address                          │    │
│     │   (We'll use your address from your profile)    │    │
│     │                                                 │    │
│     │ ● Public location                               │    │
│     │   ┌───────────────────────────────────────────┐│    │
│     │   │ Trinity Bellwoods Park                    ││    │
│     │   │ Near the western entrance                 ││    │
│     │   └───────────────────────────────────────────┘│    │
│     │   (Enter address or description)                │    │
│     │                                                 │    │
│     │ ○ Other location                                │    │
│     │   (Specify in text box)                         │    │
│     │                                                 │    │
│     │                 [← Back]          [Next →]     │    │
│     └─────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Logic:
- If "Individual's address" selected: auto-fill from user profile
- If "Public" or "Other": text input required (max 200 chars)

User Action: Selects option, fills details, clicks [Next →]
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 7: Schedule Appointment Wizard - Step 3 (Notes)        │
│ Component: ScheduleAppointmentModal (Step 3/3)               │
└──────────────────────────────────────────────────────────────┘

Modal Layout:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│     ┌─────────────────────────────────────────────────┐    │
│     │ Schedule Appointment                      (3/3) │    │
│     ├─────────────────────────────────────────────────┤    │
│     │                                                 │    │
│     │ Additional Notes (Optional)                     │    │
│     │                                                 │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ Looking forward to meeting you both!        ││    │
│     │ │ Please bring treats for training - Buddy    ││    │
│     │ │ loves learning new tricks!                  ││    │
│     │ │                                             ││    │
│     │ │                                             ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │ Max 500 characters                              │    │
│     │                                                 │    │
│     │                                                 │    │
│     │ Review Summary:                                 │    │
│     │ ✓ Saturday, Feb 4, 2026 at 2:00 PM (1 hour)   │    │
│     │ ✓ Trinity Bellwoods Park, western entrance     │    │
│     │                                                 │    │
│     │                 [← Back]    [Send Proposal]    │    │
│     └─────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

User Action: Adds optional notes, clicks [Send Proposal]
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 8: Appointment Proposal Appears in Chat                │
│ Sarah's Perspective (Recipient)                               │
└──────────────────────────────────────────────────────────────┘

Chat View:
┌─────────────────────────────────────────────────────────────┐
│ Chat with John & Buddy                                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Sarah: Perfect! Let's make it official 😊                    │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [System Message - Appointment Proposal]                │ │
│ │                                                        │ │
│ │ 📅 John proposed an appointment:                       │ │
│ │                                                        │ │
│ │ Saturday, February 4, 2026                             │ │
│ │ 🕐 2:00 PM - 3:00 PM (1 hour)                         │ │
│ │ 📍 Trinity Bellwoods Park, near the western entrance  │ │
│ │                                                        │ │
│ │ 💬 Notes: "Looking forward to meeting you both!       │ │
│ │           Please bring treats for training..."        │ │
│ │                                                        │ │
│ │ [✓ Confirm Appointment]  [✏️ Suggest Changes]         │ │
│ │                          [✗ Decline]                   │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Type message...]                              [Send]       │
└─────────────────────────────────────────────────────────────┘

Simultaneously:
- Email sent to Sarah: "John proposed a visit for Feb 4 at 2pm"
- John sees "Waiting for Sarah to confirm" message in his chat

User Action: Sarah clicks [✓ Confirm Appointment]
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 9: Appointment Confirmed                                │
│ Both Users See This                                           │
└──────────────────────────────────────────────────────────────┘

Chat View (Updated):
┌─────────────────────────────────────────────────────────────┐
│ Chat with Sarah & Buddy                                      │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ✅ Confirmed Appointment                               │ │
│ │ Saturday, February 4, 2026                             │ │
│ │ 2:00 PM - 3:00 PM (1 hour)                            │ │
│ │ 📍 Trinity Bellwoods Park, near western entrance      │ │
│ │                                                        │ │
│ │ [Modify Booking]                [Cancel Booking]       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [System Message]                                       │ │
│ │ ✨ Appointment confirmed! Both of you will receive    │ │
│ │    a confirmation email.                               │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ Sarah: Wonderful! See you Saturday at 2!                    │
│                                                              │
│ John: Perfect! Buddy is going to make Mom's day 🐕          │
│                                                              │
│ [Type message...]                              [Send]       │
└─────────────────────────────────────────────────────────────┘

Simultaneously:
- Both users receive confirmation email
- Appointment appears in "My Visits" page
- Calendar export option available (future feature)

Design Notes:
- Confirmed appointment banner stays at top of chat (persistent)
- Green background indicates success
- [Modify] and [Cancel] always accessible
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 10: Appointment Appears in "My Visits"                 │
│ Individual's Dashboard                                        │
└──────────────────────────────────────────────────────────────┘

Page: /dashboard/visits
┌─────────────────────────────────────────────────────────────┐
│ My Visits                                                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Upcoming Visits (1)                                          │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🐕 Visit with Buddy & Sarah J.                         │ │
│ │                                                        │ │
│ │ 📅 Saturday, February 4, 2026                          │ │
│ │ 🕐 2:00 PM - 3:00 PM                                  │ │
│ │ 📍 Trinity Bellwoods Park, near western entrance      │ │
│ │                                                        │ │
│ │ Status: ✅ Confirmed                                   │ │
│ │                                                        │ │
│ │ [Open Chat]  [Modify]  [Cancel]                       │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ Past Visits (0)                                              │
│ No past visits yet.                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**End of Flow 1** ✅

---

## Flow 2: Volunteer Proactively Reaches Out

### Overview
Volunteer browses individuals → sends chat request → coordinates appointment

This is the **new** bidirectional feature!

---

### Detailed Steps

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: Volunteer Browses Individuals                        │
│ Page: /dashboard/individuals (or "Connect with People" tab)  │
└──────────────────────────────────────────────────────────────┘

Screen Layout:
┌─────────────────────────────────────────────────────────────┐
│ Sunshine App                          [Profile ▼] [Messages]│
├─────────────────────────────────────────────────────────────┤
│ Navigation: [Home] [Connect with People] [My Visits] ...    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Connect with People                  [Filter: 50km ▼]      │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │ 👤            │  │ 👤            │  │ 👤            │  │
│  │  John M.      │  │  Lisa K.      │  │  Mike P.      │  │
│  │               │  │               │  │               │  │
│  │ He/Him        │  │ She/Her       │  │ They/Them     │  │
│  │ Toronto, ON   │  │ Toronto, ON   │  │ Toronto, ON   │  │
│  │ 📍 5km away   │  │ 📍 8km away   │  │ 📍 12km away  │  │
│  │               │  │               │  │               │  │
│  │ "Looking for  │  │ "My son would │  │ "Veteran with │  │
│  │ weekly visits │  │ love to meet  │  │ PTSD seeking  │  │
│  │ for my elderly│  │ a therapy     │  │ companionship"│  │
│  │ mother with   │  │ dog. He's 8   │  │               │  │
│  │ Alzheimer's..." │ │ and loves..." │  │               │  │
│  │               │  │               │  │               │  │
│  │ [Request Chat]│  │ [Request Chat]│  │ [Request Chat]│  │
│  └───────────────┘  └───────────────┘  └───────────────┘  │
│                                                              │
│  Showing people who match your audience preferences          │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Similar layout to dog directory (symmetry)
- Profile photos if uploaded, otherwise avatar with initials
- First name + last initial only (privacy)
- Bio snippet provides context (truncated)
- Same "Request Chat" CTA

User Action: Sarah (volunteer) clicks [Request Chat] on Mike's card
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: Chat Request Sent                                    │
│ (Same flow as Flow 1, but reversed roles)                    │
└──────────────────────────────────────────────────────────────┘

Modal:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│            ┌───────────────────────────────┐                │
│            │  ✉️ Chat Request Sent!        │                │
│            ├───────────────────────────────┤                │
│            │                               │                │
│            │  Your request to chat with    │                │
│            │  Mike P. has been sent.       │                │
│            │                               │                │
│            │  You'll receive a notification│                │
│            │  when Mike accepts.           │                │
│            │                               │                │
│            │         [Got it!]             │                │
│            └───────────────────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Mike receives email: "Sarah wants to connect with you and Buddy"
Mike sees pending request in dashboard

(Rest of flow identical to Flow 1, Steps 3-10)
```

**End of Flow 2** ✅

---

## Flow 3: Modify Existing Appointment

### Overview
User needs to change appointment time/location

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: User Clicks "Modify Booking"                        │
│ From: Chat banner OR My Visits page                          │
└──────────────────────────────────────────────────────────────┘

Current Appointment Banner (in chat):
┌─────────────────────────────────────────────────────────────┐
│ ✅ Confirmed Appointment                                     │
│ Saturday, February 4, 2026                                   │
│ 2:00 PM - 3:00 PM (1 hour)                                  │
│ 📍 Trinity Bellwoods Park                                   │
│                                                              │
│ [Modify Booking] ← User clicks this  [Cancel Booking]       │
└─────────────────────────────────────────────────────────────┘
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: Modify Wizard Opens (Pre-filled with Current Values)│
│ Component: ModifyAppointmentModal                            │
└──────────────────────────────────────────────────────────────┘

Modal:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│     ┌─────────────────────────────────────────────────┐    │
│     │ Modify Appointment                        (1/3) │    │
│     ├─────────────────────────────────────────────────┤    │
│     │                                                 │    │
│     │ Current: Saturday, Feb 4, 2026 at 2:00 PM       │    │
│     │                                                 │    │
│     │ New Date *                                      │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ [📅 Sunday, February 5, 2026        ▼]     ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │                                                 │    │
│     │ New Start Time *                                │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ [🕐 3:00 PM                          ▼]     ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │                                                 │    │
│     │ Duration *                                      │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ [⏱️ 1 hour                           ▼]     ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │                                                 │    │
│     │                       [Cancel]    [Next →]     │    │
│     └─────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

(Steps 2 and 3 same as original scheduling wizard)
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: Review Changes (Shows Diff)                         │
│ Component: ModifyAppointmentModal (Final Step)               │
└──────────────────────────────────────────────────────────────┘

Modal:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│     ┌─────────────────────────────────────────────────┐    │
│     │ Modify Appointment                        (3/3) │    │
│     ├─────────────────────────────────────────────────┤    │
│     │                                                 │    │
│     │ Review Changes:                                 │    │
│     │                                                 │    │
│     │ Date/Time:                                      │    │
│     │ ❌ Saturday, Feb 4, 2026 at 2:00-3:00 PM       │    │
│     │ ✅ Sunday, Feb 5, 2026 at 3:00-4:00 PM         │    │
│     │                                                 │    │
│     │ Location:                                       │    │
│     │ ✅ Trinity Bellwoods Park (unchanged)           │    │
│     │                                                 │    │
│     │ Reason for Change (Optional):                   │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ Something came up Saturday. Is Sunday ok?   ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │                                                 │    │
│     │ ⚠️  Sarah will need to confirm these changes.  │    │
│     │                                                 │    │
│     │                 [← Back]  [Propose Changes]    │    │
│     └─────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

User Action: Clicks [Propose Changes]
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 4: Other Party Sees Modification Request               │
│ Sarah's Chat View                                             │
└──────────────────────────────────────────────────────────────┘

Chat:
┌─────────────────────────────────────────────────────────────┐
│ Chat with John & Buddy                                       │
├──────────────────────────────────────────────────────────────┤
│ ⚠️ Current Appointment (Pending Changes)                     │
│ Saturday, February 4, 2026 • 2:00-3:00 PM                   │
│ Waiting for your approval of John's proposed changes...     │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [System Message]                                       │ │
│ │                                                        │ │
│ │ ✏️ John proposed changes to your appointment:          │ │
│ │                                                        │ │
│ │ Current:                                               │ │
│ │ Saturday, Feb 4, 2026 at 2:00-3:00 PM                 │ │
│ │ Trinity Bellwoods Park                                 │ │
│ │                                                        │ │
│ │ Proposed:                                              │ │
│ │ Sunday, Feb 5, 2026 at 3:00-4:00 PM                   │ │
│ │ Trinity Bellwoods Park (same location)                 │ │
│ │                                                        │ │
│ │ 💬 Reason: "Something came up Saturday. Is Sunday ok?"│ │
│ │                                                        │ │
│ │ [✓ Approve Changes]  [✏️ Suggest Different Time]      │ │
│ │                      [✗ Keep Original]                 │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘

User Action: Sarah clicks [✓ Approve Changes]
Appointment updated, both receive confirmation
```

**End of Flow 3** ✅

---

## Flow 4: Cancel Appointment

### Overview
User needs to cancel appointment (with reason)

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: User Clicks "Cancel Booking"                        │
└──────────────────────────────────────────────────────────────┘

Chat banner:
┌─────────────────────────────────────────────────────────────┐
│ ✅ Confirmed Appointment                                     │
│ Saturday, February 4, 2026 • 2:00-3:00 PM                   │
│                                                              │
│ [Modify Booking]  [Cancel Booking] ← User clicks            │
└─────────────────────────────────────────────────────────────┘
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 2: Cancellation Modal (Ask for Reason)                 │
│ Component: CancelAppointmentModal                            │
└──────────────────────────────────────────────────────────────┘

Modal:
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│     ┌─────────────────────────────────────────────────┐    │
│     │ Cancel Appointment                              │    │
│     ├─────────────────────────────────────────────────┤    │
│     │                                                 │    │
│     │ Are you sure you want to cancel this visit?     │    │
│     │                                                 │    │
│     │ Appointment Details:                            │    │
│     │ Saturday, Feb 4, 2026 at 2:00-3:00 PM          │    │
│     │ Trinity Bellwoods Park                          │    │
│     │                                                 │    │
│     │ Reason for Cancellation (Optional):             │    │
│     │ ┌─────────────────────────────────────────────┐│    │
│     │ │ Family emergency came up. So sorry!         ││    │
│     │ │ Can we reschedule for next weekend?         ││    │
│     │ └─────────────────────────────────────────────┘│    │
│     │                                                 │    │
│     │ ⚠️  Sarah will be notified immediately.         │    │
│     │     Your chat will remain open for rescheduling.│    │
│     │                                                 │    │
│     │              [Go Back]  [Confirm Cancellation] │    │
│     └─────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘

User Action: Clicks [Confirm Cancellation]
```

---

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 3: Cancellation Confirmed                               │
│ Both Users' Chats                                             │
└──────────────────────────────────────────────────────────────┘

Chat View:
┌─────────────────────────────────────────────────────────────┐
│ Chat with Sarah & Buddy                                      │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐ │
│ │ [System Message]                                       │ │
│ │                                                        │ │
│ │ ❌ Appointment Canceled                                │ │
│ │                                                        │ │
│ │ John canceled the appointment for:                     │ │
│ │ Saturday, Feb 4, 2026 at 2:00-3:00 PM                 │ │
│ │                                                        │ │
│ │ 💬 Reason: "Family emergency came up. So sorry!       │ │
│ │            Can we reschedule for next weekend?"       │ │
│ │                                                        │ │
│ │ You can schedule a new appointment anytime.            │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────┐   │
│ │     📅 Schedule Appointment                          │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ Sarah: No worries! I hope everything is okay. Let me      │
│        know when you're ready to reschedule.               │
│                                                              │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Chat stays open (important for rescheduling)
- "Schedule Appointment" button reappears (can book again)
- Canceled appointment moves to "Past Visits" with "Canceled" badge
```

**End of Flow 4** ✅

---

## Key UI Components Reference

### 1. Dog/Individual Profile Card

```
┌─────────────────────┐
│ [Profile Photo]     │
│                     │
│ Name (First + Last  │
│ initial for person) │
│                     │
│ Details:            │
│ • Type/Age/Location │
│ • Distance badge    │
│                     │
│ General Availability│
│ (if volunteer)      │
│                     │
│ [Primary CTA Button]│
└─────────────────────┘

Dimensions: 280px wide
Colors: White background, subtle border
Button: Primary brand color
```

### 2. Appointment Banner (In Chat)

```
┌─────────────────────────────────────┐
│ [Status Icon] Status Text           │
│ Date                                │
│ Time • Duration                     │
│ 📍 Location                         │
│ [Action Buttons]                    │
└─────────────────────────────────────┘

States:
- Confirmed: Green background, ✅ icon
- Pending: Yellow background, ⏱️ icon
- Canceled: Gray background, ❌ icon
```

### 3. Schedule Appointment Wizard

```
Multi-step modal (3 steps)
- Step indicator at top (1/3, 2/3, 3/3)
- Progress bar (optional)
- Form fields with clear labels
- Validation messages inline
- [Back] and [Next/Submit] buttons
- [Cancel] link to close

Dimensions: 500px wide, height auto
```

### 4. Chat Interface

```
Sidebar (200px):
- List of active chats
- Unread badge counts
- Last message preview

Main area:
- Chat header (other user info)
- Appointment banner (if exists)
- Message area (scrollable)
- "Schedule Appointment" button (prominent)
- Message input at bottom

Mobile: Sidebar collapses to list view
```

---

## Color & Style Recommendations

### Brand Colors (Adjust to Your Brand)
- **Primary:** Blue (#3B82F6) - Call-to-action buttons
- **Success:** Green (#10B981) - Confirmed appointments
- **Warning:** Yellow (#F59E0B) - Pending/modifications
- **Error:** Red (#EF4444) - Cancellations
- **Neutral:** Gray (#6B7280) - Text, borders

### Typography
- **Headings:** Bold, 24px (H1), 20px (H2), 18px (H3)
- **Body:** Regular, 16px
- **Small:** 14px (metadata, timestamps)
- **Button:** Semi-bold, 16px

### Spacing
- **Component padding:** 24px
- **Card gaps:** 16px
- **Button padding:** 12px 24px
- **Input height:** 44px (touch-friendly)

---

## Mobile Considerations

### Responsive Breakpoints
- **Desktop:** 1024px+
- **Tablet:** 768px - 1023px
- **Mobile:** < 768px

### Mobile-Specific Changes

1. **Directory Grid:**
   - Desktop: 3 columns
   - Tablet: 2 columns
   - Mobile: 1 column (full width cards)

2. **Chat Interface:**
   - Mobile: Full-screen, hide sidebar
   - Tab bar at bottom for navigation
   - Swipe gestures to navigate between chats

3. **Modals:**
   - Desktop: Centered modal (500px)
   - Mobile: Full-screen modal (easier to interact)

4. **Buttons:**
   - Mobile: Full-width buttons (easier to tap)
   - Minimum tap target: 44px x 44px

---

## Accessibility Notes

### WCAG 2.1 AA Compliance

1. **Keyboard Navigation:**
   - All interactive elements tabbable
   - Modals trap focus
   - Esc key closes modals

2. **Screen Readers:**
   - Semantic HTML (buttons, headings, forms)
   - ARIA labels on icons
   - Status messages announced

3. **Color Contrast:**
   - Text on background: minimum 4.5:1
   - Buttons: 3:1 minimum

4. **Focus Indicators:**
   - Visible focus rings on all interactive elements

---

## Animation Recommendations

### Micro-interactions
- **Button hover:** Slight scale (1.02x) + shadow
- **Card hover:** Lift effect (shadow increase)
- **Modal enter:** Fade in + scale from 0.95x
- **Success feedback:** Checkmark animation

### Transitions
- **Duration:** 200ms (quick), 300ms (standard)
- **Easing:** ease-out for entrances, ease-in for exits

---

## Next Steps for Design

1. **Create High-Fidelity Mockups:**
   - Use this document as blueprint
   - Design in Figma/Sketch
   - Create interactive prototype

2. **User Testing:**
   - Test wizard flow (3 steps - is it too many?)
   - Test chat interface (is Schedule button prominent enough?)
   - Test mobile experience

3. **Gather Feedback:**
   - Share with team
   - Test with 2-3 real users
   - Iterate based on feedback

---

**End of User Flow Diagrams Document**

This document provides all the detail needed to create visual mockups in any design tool. Each flow is broken down step-by-step with exact UI descriptions.
