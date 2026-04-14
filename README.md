# Sunshine Therapy Dogs

A platform connecting therapy dog volunteers with individuals seeking therapeutic visits. Volunteers list their availability, individuals browse and request visits, and the app manages scheduling, real-time messaging, and notifications.

## Tech Stack

| Area | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Auth | Clerk |
| Database | Supabase (PostgreSQL + RLS) |
| Real-time Chat | Stream Chat |
| Email | Resend + Handlebars templates |
| Styling | TailwindCSS 4.0 |
| Deployment | Vercel |

## Getting Started

### 1. Prerequisites

- Node.js 16+
- Accounts for: Clerk, Supabase, Stream Chat, Resend

### 2. Environment Variables

Create a `.env.local` file with:

```bash
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stream Chat
NEXT_PUBLIC_STREAM_CHAT_API_KEY=
STREAM_CHAT_SECRET=

# Resend (email)
RESEND_API_KEY=
```

### 3. Install & Run

```bash
npm install
npm run dev        # http://localhost:3000
```

For HTTPS local dev (required for some PWA/auth flows):

```bash
npm run dev:secure
```

## Project Structure

```
src/
├── app/
│   ├── (pages)/        # Route pages (dashboard, profile, etc.)
│   ├── api/            # API routes
│   └── layout.tsx      # Root layout with providers
├── components/
│   ├── admin/          # Admin-only UI
│   ├── appointments/   # Appointment cards, panels, groups
│   ├── availability/   # Volunteer availability management
│   ├── chat/           # Chat request UI
│   ├── dashboard/      # Role-specific dashboard views
│   ├── layout/         # Global layout components
│   ├── messaging/      # Stream Chat components
│   ├── visits/         # Visit history/management
│   └── ui/             # Shared UI primitives (shadcn/ui)
├── hooks/              # Custom React hooks
├── types/              # TypeScript type definitions
└── utils/
    ├── supabase/       # DB client helpers (server, admin, client)
    └── ...             # Email, date formatting, etc.
```

## User Roles

- **Individual** — browses volunteers, requests visits, chats with volunteers
- **Volunteer** — manages availability, receives visit requests, chats with individuals
- **Admin** — manages users, oversees all appointments and chats

## Key Features

### Chat-Based Scheduling
Scheduling is initiated through a chat-request flow rather than a traditional calendar booking. Either party can propose a visit; the other accepts or declines. See `docs/CHAT_SCHEDULING_MIGRATION_PLAN.md` for the current architectural state of this system.

### Real-Time Messaging
Built on Stream Chat. Each confirmed appointment has a dedicated chat channel. The `StreamChatClientManager` handles connection lifecycle, token caching, and reconnection. See `docs/STREAM_CHAT_SYSTEM_DOCS.md`.

### Email Notifications
Unread chat messages trigger delayed email notifications (default: 1 hour after message, checked every 30 min via Vercel Cron). Notifications are automatically cancelled if the user reads the message first. Configurable in `src/utils/notificationConfig.ts`.

### Volunteer Availability
Volunteers set a weekly availability template; the system generates 12 weeks of recurring slots using RRule. Slots with active appointments are protected from accidental deletion.

### User Archiving
Admins can archive inactive accounts. Archived users are hidden from the platform but their data is preserved. Archiving automatically cancels active appointments and notifies the other parties.

## Database

Schema and RLS policies are documented in `docs/DATABASE_SCHEMA.md`.

Always use the correct Supabase client for your context:
- `createSupabaseServerClient()` — server-side, respects RLS
- `createSupabaseAdminClient()` — bypasses RLS (admin operations only)
- `useSupabaseClient()` — client-side

## Useful Scripts

```bash
npm run monitor-chat       # Check Stream Chat connection health
npm run test-chat          # Test chat creation
npm run test-reconnection  # Test Stream Chat reconnection flow
npm run close-chats        # Manually trigger expired chat closure
npm run check-user         # Check user registration status
```

Migration SQL files and one-time setup scripts live in `scripts/`.

## Deployment

Deployed on Vercel. Fast deploy (skips rebuild if assets are prebuilt):

```bash
npm run deploy-fast
```

Vercel Cron is configured in `vercel.json` to process pending email notifications every 30 minutes.

## Docs

Reference documentation lives in `docs/`:

- `DATABASE_SCHEMA.md` — full schema and RLS policies
- `STREAM_CHAT_SYSTEM_DOCS.md` — chat system overview
- `STREAM_CHAT_SETUP.md` — Stream Chat account/environment setup
- `STREAM_CHAT_CONNECTION_MANAGEMENT.md` — connection management details
- `CHAT_SCHEDULING_MIGRATION_PLAN.md` — current chat-based scheduling redesign
- `CHAT_SCHEDULING_MIGRATION_LOG.md` — SQL change log for the redesign
- `NATIVE_APP_DEPLOYMENT.md` — future iOS/Android deployment guide (Capacitor)
