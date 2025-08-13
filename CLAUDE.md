# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build & Development
- `npm run dev` - Start development server (http://localhost:3000)
- `npm run dev:secure` - Start secure development server (uses node server.js)
- `npm run build` - Create production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Testing & Debugging
- `npm run test-chat` - Test chat creation functionality
- `npm run test-reconnection` - Test Stream Chat reconnection
- `npm run test-admin-chats` - Test admin chat functionality
- `npm run close-chats` - Manually close expired chats
- `npm run monitor-chat` - Monitor Stream Chat connection status

### Deployment
- `npm run deploy-fast` - Fast Vercel deployment with prebuilt assets

## Project Architecture

### Tech Stack
- **Framework**: Next.js 15 with App Router (React 19)
- **Authentication**: Clerk
- **Database**: Supabase with PostgreSQL and Row Level Security (RLS)
- **Real-time Chat**: Stream Chat
- **Styling**: TailwindCSS 4.0
- **Email**: Resend with Handlebars templates
- **Deployment**: Vercel

### Key Dependencies
- `@clerk/nextjs` - Authentication and user management
- `@supabase/supabase-js` - Database client with RLS integration
- `stream-chat` & `stream-chat-react` - Real-time messaging
- `resend` - Email delivery
- `@fullcalendar/react` - Appointment scheduling
- `handlebars` - Email template engine

## Architecture Overview

### Authentication & Authorization
- **Clerk Integration**: Handles user authentication and session management
- **Middleware Protection**: Custom middleware (`src/middleware.ts`) handles route protection
- **Access Gate**: Password-protected unlock system for beta access
- **User Roles**: `individual`, `volunteer`, `admin` with different permissions

### Database Architecture
- **Supabase Integration**: PostgreSQL with comprehensive RLS policies
- **User Management**: Single `users` table supporting multiple roles
- **Appointment System**: `appointments`, `appointment_availability` tables
- **Dog Profiles**: `dogs` table linked to volunteers
- **Audience Matching**: `audience_categories` system for volunteer-individual matching
- **Chat Integration**: `appointment_chats` and `chat_logs` for message tracking

### Stream Chat System
- **Connection Management**: Enhanced client manager with token caching and smart reconnection
- **Automatic Chat Creation**: Chats created when appointments confirmed
- **Admin Monitoring**: Full chat oversight with unread alerts
- **Performance Optimizations**: Token caching, activity-based management, connection health monitoring
- **Mobile PWA**: Optimized for iOS/Android with manifest and service worker support

### File Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (pages)/           # Grouped routes
│   ├── api/               # API routes
│   └── layout.tsx         # Root layout with providers
├── components/            # React components
│   ├── admin/            # Admin-only components
│   ├── dashboard/        # Dashboard components
│   ├── layout/           # Layout components
│   ├── messaging/        # Chat components
│   └── ui/               # Reusable UI components
├── hooks/                # Custom React hooks
├── utils/                # Utility functions
│   └── supabase/        # Database utilities
└── types/                # TypeScript definitions
```

## Important Configuration

### Environment Variables
Critical environment variables needed:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_STREAM_CHAT_API_KEY`
- `STREAM_CHAT_SECRET`
- `RESEND_API_KEY`

### Build Configuration
- **React Strict Mode**: Disabled in `next.config.ts` for Stream Chat WebSocket compatibility
- **TypeScript**: Strict mode enabled with absolute imports via `@/*` paths
- **Webpack**: Custom ignoreWarnings configuration for Supabase realtime warnings

### Mobile PWA Support
- **Manifest**: Configured for installable PWA experience
- **Icons**: Maskable icons for Android adaptive icon support
- **Viewport**: Mobile-optimized viewport with notch support
- **App Shortcuts**: Quick access to key features

## Development Patterns

### Database Operations
- Always use appropriate Supabase client:
  - `createSupabaseServerClient()` for server-side with RLS
  - `createSupabaseAdminClient()` for admin operations bypassing RLS
  - `useSupabaseClient()` for client-side operations
- RLS policies are comprehensive - check `DATABASE_SCHEMA.md` for policy details

### Stream Chat Integration
- Use `StreamChatClientManager` for connection management
- Token caching prevents unnecessary API calls
- Always handle disconnection callbacks in React components
- Use `isClientReady()` checks before channel operations

### Component Patterns
- Layout components handle global providers and mobile optimizations
- Dashboard components are role-specific (Individual, Volunteer, Admin)
- UI components follow shadcn/ui patterns with class-variance-authority
- Admin components have separate navigation and functionality

### API Routes
- Authentication required for most API routes via middleware
- Admin routes use separate `/api/admin/` prefix
- Stream Chat webhook endpoint bypasses auth middleware
- Error handling includes specific logging for debugging

## Testing & Debugging

### Chat System Debugging
- Use `npm run monitor-chat` to check Stream Chat connection health
- Use `npm run test-reconnection` to verify disconnection/reconnection flow
- Check browser dev tools for WebSocket connection status
- Admin chat logs available at `/dashboard/admin` for message history

### Common Issues
- **Stream Chat Disconnection**: Enhanced connection manager handles most cases automatically
- **Database Permission Issues**: Verify RLS policies and use appropriate client type
- **Mobile PWA Issues**: Check manifest.json validity and icon file paths
- **Authentication Failures**: Verify Clerk configuration and middleware setup

## Mobile Development Notes

### iOS Specific
- PWA installation supported via Safari "Add to Home Screen"
- Viewport configured for notched devices with `viewport-fit=cover`
- Status bar styling set to `default` for compatibility

### Android Specific
- Maskable icons support adaptive icon system
- Chrome PWA installation with enhanced manifest
- Play Store integration ready for future TWA deployment

### Performance Considerations
- Stream Chat connection management optimized for mobile networks
- Token caching reduces API calls by 80%+ for active users
- Inactivity detection prevents unnecessary connection costs
- Tab switching optimized with quick disconnect/reconnect (20x faster)

## Security & Privacy

### Row Level Security
- Comprehensive RLS policies protect user data
- Users can only see approved users and their own data
- Admin operations use service role key to bypass RLS when needed
- Chat data protected with user-specific access policies

### Authentication Security
- Clerk handles secure authentication flow
- JWT tokens used for Supabase integration
- Stream Chat tokens server-generated with user validation
- Password-protected beta access gate

### Data Protection
- Personal information visible only to authorized users
- Chat messages logged for admin monitoring but protected by RLS
- Email addresses and contact info secured at database level
- Location data used only for matching, not exposed publicly