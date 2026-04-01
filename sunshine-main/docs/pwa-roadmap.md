# Sunshine PWA — Local-First Roadmap & Spec

## Overview

Sunshine is a server-rendered Rust/Rocket application. This document specifies a
**hybrid local-first PWA layer** targeting the volunteer mobile experience. The
server-rendered admin and agency surfaces remain unchanged. Only the volunteer
experience gains offline capability, installability, and push notifications.

The guiding principle: **the app must be useful with no network connection.**
Shift data, agency details, and navigation links must be readable offline.
Mutations (photos, surveys, check-ins) queue locally and sync transparently
when connectivity returns.

---

## Scope

### In scope
- PWA installability (manifest, service worker, home screen icon)
- Offline shift list and shift detail views for the authenticated volunteer
- Offline agency detail + "Open in Maps" navigation
- Offline dog profile (volunteer's own dogs)
- Camera capture → IndexedDB → background sync to existing upload endpoint
- Photo gallery with cached thumbnails
- Geolocation for proximity-based check-in suggestion
- Web Push notifications for shift reminders and admin alerts
- Conflict-safe optimistic mutation queue

### Out of scope (this phase)
- Admin or agency surfaces — always-connected, always desktop
- Real-time collaborative features
- Full offline onboarding / first-run without a network connection
- CRDT-based multi-device conflict merging (single volunteer session assumed)

---

## Principles

1. **Local reads are instant.** No spinner for data the app already has.
2. **The network is optional after first sync.** Core flows work on a plane.
3. **Mutations never disappear.** Pending actions survive app close and device
   restart via IndexedDB.
4. **Server is the source of truth for shared data.** Shift schedules, agency
   info, and rosters are admin-managed — the client never wins a conflict on
   these.
5. **Client owns its own actions.** Photos taken, surveys submitted, and
   check-ins initiated by the volunteer are committed locally first, then
   confirmed by the server.
6. **Failures are surfaced, not hidden.** A "pending sync" badge tells the
   volunteer their action is queued, not lost.

---

## Architecture

### Layers

```
+--------------------------------------------------+
|  Tera templates (server-rendered shell)          |
|  Alpine.js (reactive offline-aware UI)           |
+--------------------------------------------------+
|  Dexie.js (IndexedDB ORM)                        |
|  -- local read/write for all offline-capable data|
+--------------------------------------------------+
|  Service Worker (Workbox)                        |
|  -- cache strategy per resource type             |
|  -- Background Sync queue                        |
|  -- Push notification handler                    |
+--------------------------------------------------+
|  Sync API  (new Rocket routes under /api/v1/)    |
|  Push API  (new Rocket routes under /api/v1/)    |
+--------------------------------------------------+
```

### Page strategy

| Surface                  | Rendering         | Offline support              |
|--------------------------|-------------------|------------------------------|
| `/volunteer/shifts`      | Hydrated from IDB | Full — reads from Dexie      |
| `/volunteer/shifts/:id`  | Hydrated from IDB | Full — reads from Dexie      |
| `/volunteer/dashboard`   | Hydrated from IDB | Partial — summary cards only |
| `/volunteer/gallery`     | Hydrated from IDB | Cached thumbnails            |
| `/volunteer/profile`     | Server-rendered   | None (settings only)         |
| All admin / agency pages | Server-rendered   | None                         |

---

## Dexie.js Local Schema

```js
// db.js -- Dexie database definition
const db = new Dexie('sunshine');

db.version(1).stores({
  // Synced from server -- server wins on conflict
  shifts:          'id, date, status, agency_id, synced_at',
  agencies:        'id, name, synced_at',
  dogs:            'id, volunteer_id, synced_at',
  volunteer:       'id',                        // single row, own profile

  // Client-owned -- optimistic, synced to server
  pending_actions: '++id, type, created_at, status',
  //   type: 'checkin' | 'checkout' | 'survey_submit' | 'photo_upload'
  //   status: 'pending' | 'syncing' | 'failed'

  pending_uploads: '++id, shift_id, agency_id, created_at, status',
  //   blob stored as ArrayBuffer
  //   status: 'pending' | 'syncing' | 'failed' | 'complete'

  // Cached asset metadata (thumbnails fetched via SW cache)
  assets:          'id, shift_id, thumb_url, starred, synced_at',
});
```

---

## Sync Protocol

### Initial sync / refresh

```
GET /api/v1/volunteer/sync?since=<unix_timestamp>
```

Returns a delta payload since the given timestamp (or full payload if omitted):

```json
{
  "volunteer": { ... },
  "shifts": [ ... ],
  "agencies": [ ... ],
  "dogs": [ ... ],
  "assets": [ ... ],
  "server_time": 1741286400
}
```

- Called on app open (if online) and after Background Sync completes
- Client stores `server_time` as `last_synced_at` in `localStorage`
- Subsequent calls pass `?since=last_synced_at` for delta only

### Mutation queue (pending_actions)

Each optimistic mutation is written to `pending_actions` with `status: 'pending'`
before any network call is attempted.

Background Sync tag: `sunshine-sync`

On sync:
1. Service worker fires `sync` event
2. App drains `pending_actions` in order of `created_at`
3. Each action POSTed to its corresponding API endpoint
4. On HTTP 200/201: record deleted from IDB
5. On HTTP 409 (conflict): server response applied, local record updated, UI
   notified via `BroadcastChannel`
6. On network failure: record stays as `pending`, retried on next sync event
   with exponential backoff (max 5 retries, then `status: 'failed'`)

### Conflict resolution

| Data type           | Strategy                                                  |
|---------------------|-----------------------------------------------------------|
| Shift schedule      | Server wins unconditionally                               |
| Agency info         | Server wins unconditionally                               |
| Check-in / out      | Idempotent -- server deduplicates by shift_id + volunteer |
| Survey submission   | Last-write-wins by `submitted_at` timestamp               |
| Photo upload        | Append-only -- no conflicts possible                      |
| Dog profile edits   | Last-write-wins by `updated_at` timestamp                 |

---

## Service Worker (Workbox)

### Cache strategies by resource type

| Resource                        | Strategy                  | TTL      |
|---------------------------------|---------------------------|----------|
| App shell (HTML, SW, manifest)  | Cache-first               | 7 days   |
| Static assets (CSS, JS, icons)  | Stale-while-revalidate    | 30 days  |
| Thumbnail images (`/uploads/*`) | Cache-first               | 30 days  |
| API responses (`/api/v1/*`)     | Network-first + IDB cache | 5 min    |
| Navigation requests             | Network-first + fallback  | --       |

### Offline fallback

A pre-cached `offline.html` page is served for navigation requests that fail
when the network is unavailable and the page is not in cache. It prompts the
volunteer to open the shifts list (which reads from Dexie).

---

## Push Notifications

### Server side

New dependency: `web-push` crate (Rust VAPID implementation).

New DB migration:

```sql
CREATE TABLE push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id  UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);
```

VAPID keys generated once and stored in environment:

```
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_SUBJECT=mailto:admin@sunshine.example.com
```

New Rocket routes:

```
POST   /api/v1/push/subscribe    -- save PushSubscription JSON from browser
DELETE /api/v1/push/subscribe    -- remove subscription (on permission revoke)
```

Push is triggered from existing background jobs:
- `survey_trigger.rs` -- send reminder 24h before shift
- Shift assignment / waitlist promotion -- immediate notification
- Shift change / cancellation -- immediate notification

### Client side

Permission requested after first successful login on a PWA install.
Subscription sent to `POST /api/v1/push/subscribe`.

Notification payload:

```json
{
  "title": "Shift reminder -- Toronto General",
  "body": "Tomorrow at 10:00 AM. Tap to view details.",
  "url": "/volunteer/shifts/abc123",
  "icon": "/icons/icon-192.png",
  "badge": "/icons/badge-72.png"
}
```

Service worker `push` handler opens or focuses the app and navigates to `url`.

---

## Camera & Photo Upload

Flow:
1. Volunteer taps "Add Photo" on shift detail (online or offline)
2. `MediaDevices.getUserMedia({ video: true })` or `<input type="file" capture>`
3. Frame captured -- resized client-side to max 2048px via `<canvas>`
4. Blob stored in `pending_uploads` (IndexedDB) with `shift_id`
5. If online: Background Sync fires immediately -- POST to existing
   `/api/v1/shifts/:id/assets/upload`
6. If offline: queued, synced on next connectivity event
7. Optimistic thumbnail shown in gallery from the local blob URL

---

## Geolocation -- Check-in Suggestion

When a volunteer opens a shift detail page and the shift is scheduled for today:
1. `navigator.geolocation.getCurrentPosition()` called (with permission)
2. Distance calculated client-side (Haversine) between current position and
   `agency.lat/lng`
3. If within 500m: "You appear to be at the venue -- check in now?" prompt shown
4. Check-in action written to `pending_actions` queue -- synced to server

This is a **suggestion only** -- the volunteer can always check in manually
regardless of location. No server-side enforcement in this phase.

---

## Web App Manifest

```json
{
  "name": "Sunshine",
  "short_name": "Sunshine",
  "description": "Therapy dog volunteer shift management",
  "start_url": "/volunteer/shifts",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#f59e0b",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

---

## New Backend Endpoints

| Method | Path                         | Description                               |
|--------|------------------------------|-------------------------------------------|
| GET    | `/api/v1/volunteer/sync`     | Delta sync payload (shifts, agencies...)  |
| POST   | `/api/v1/push/subscribe`     | Save push subscription                    |
| DELETE | `/api/v1/push/subscribe`     | Remove push subscription                  |
| POST   | `/api/v1/volunteer/checkin`  | Check in to a shift (idempotent)          |
| POST   | `/api/v1/volunteer/checkout` | Check out of a shift (idempotent)         |

Existing endpoints consumed by the PWA sync queue:
- `POST /api/v1/shifts/:id/assets/upload` -- photo upload (already exists)
- `POST /volunteer/shifts/:id/survey` -- survey submission

---

## Frontend Dependencies

| Library  | Version | Purpose                                |
|----------|---------|----------------------------------------|
| Dexie.js | 4.x     | IndexedDB ORM                          |
| Workbox  | 7.x     | Service worker utilities + strategies  |

Both loaded from CDN with integrity hashes, or bundled via a simple esbuild
step. No full JS build pipeline required.

---

## Implementation Phases

### Phase 1 -- Installable shell (COMPLETED ✅)
- manifest.json served from Rocket static route
- Basic service worker (Workbox) caching app shell + static assets
- Offline fallback page
- Icons + theme colour
- Meta tags in `base.html.tera`

### Phase 2 -- Offline shift viewing (COMPLETED ✅)
- `GET /api/v1/volunteer/sync` endpoint
- Dexie.js schema + sync-on-open logic
- Volunteer shifts list + detail pages read from Dexie when offline
- "Last synced X minutes ago" indicator in UI
- "Open in Maps" link from agency address (just a URL, no extra API needed)

### Phase 3 -- Optimistic mutations + background sync (NEXT 🚀)
- `pending_actions` queue in Dexie
- Service worker Background Sync registration
- Check-in / check-out via queue
- Survey submission via queue
- Pending badge indicator in UI

### Phase 4 -- Camera + photo sync
- Camera capture on shift detail
- Blob stored to `pending_uploads` -- background sync to upload endpoint
- Optimistic gallery thumbnail rendered from local blob

### Phase 5 -- Push notifications
- VAPID key generation + env config
- `push_subscriptions` migration + Rocket routes
- Permission prompt flow on PWA install
- Push dispatch from existing background jobs (shift reminders, changes)

### Phase 6 -- Geolocation check-in
- Haversine distance calculation on shift detail open
- Proximity prompt if within 500m on shift day
- Graceful degradation if permission denied

---

## Open Questions

1. **Sync window:** should the sync include full shift history or only upcoming
   + last 30 days? Affects IDB storage size on device.
2. **Offline survey drafts:** should partial survey state be persisted to IDB
   as a draft, or only written to the queue once complete?
3. **Multi-device:** if a volunteer uses both phone and tablet, should pending
   actions be visible across devices? Requires a server-side pending queue
   rather than client-only IDB.
4. **iOS limitations:** Background Sync and Web Push have historically had
   limited Safari/iOS support. Do we need an iOS-specific fallback strategy?
5. **Auth expiry offline:** if the session cookie expires while the volunteer
   is offline, how does the app handle re-auth on reconnect without losing
   queued actions?
