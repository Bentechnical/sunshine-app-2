# Google Sheets Mirror

> **Status:** Planned — not yet built
> **Purpose:** One-way mirror of app data into a Google Sheet so PDs and ED always have a human-readable, always-current backup that doesn't depend on app access.

---

## Design Principles

- **App is the source of truth.** The Sheet is read-only for PDs. No bidirectional sync.
- **Cron-based full resync**, not per-write triggers. The Sheet is an oversight tool, not a live dashboard — a few hours of lag is acceptable. A full resync on schedule is simpler and more robust than hooking every individual API write.
- **One tab per region.** Matches the structure PDs are used to from the Volunteer Master List spreadsheet.
- **Start with candidate pipeline data.** Can be extended to org visits or approved volunteer lists later.

---

## Sheet Structure

### One tab per region
Tab names match region names from `pd_regions` (e.g., "Durham", "Toronto", "Ottawa").

A "Summary" tab can list totals per region (candidate count, pending police checks, etc.) — optional, add later.

### Candidate tab columns

| Column | Source |
|--------|--------|
| Name | `users.first_name + last_name` |
| Dog | `dogs.dog_name` |
| Breed | `dogs.dog_breed` |
| Phone | `users.phone_number` |
| Email | `users.email` |
| Applied Date | `users.created_at` |
| Interview Date | `users.interview_date` |
| Interview Outcome | `users.interview_outcome` |
| Assessment Date | `assessment_registrations.timeslot` (from linked session) |
| Assessment Outcome | `assessment_registrations.outcome` |
| Probation Status | `users.probation_status` |
| Police Check Status | Derived: `vsc_date_issued` present → date; else "Awaiting" |
| Candidate Stage | `users.candidate_stage` |
| Notes | `users.interview_notes` (or combined notes field) |
| Last Synced | Timestamp written by the cron job |

---

## Implementation Plan

### 1. Google Setup (one-time, manual)

1. Create a Google Cloud project (or use existing one)
2. Enable the Google Sheets API
3. Create a service account → download JSON key
4. Create the target Google Sheet; share it with the service account email (Editor access)
5. Note the Sheet ID from the URL (`https://docs.google.com/spreadsheets/d/SHEET_ID/edit`)

### 2. Environment Variables

```bash
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}  # full JSON as string
GOOGLE_SHEETS_VOLUNTEER_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms  # sheet ID
```

Store `GOOGLE_SERVICE_ACCOUNT_KEY` as the raw JSON string (one line). Parse it with `JSON.parse()` in code.

### 3. Files to Create

**`src/utils/googleSheets.ts`**
- Initializes auth with the service account
- Exports helpers:
  - `clearAndWriteTab(sheetId, tabName, rows)` — clears a tab, writes header + data rows
  - `ensureTab(sheetId, tabName)` — creates the tab if it doesn't exist

**`src/app/api/cron/sync-sheets/route.ts`**
- Queries all candidates grouped by region
- Calls `clearAndWriteTab` for each region tab
- Writes a "Last synced: [timestamp]" note somewhere visible
- Protected: verify `Authorization: Bearer CRON_SECRET` header (same pattern as other cron routes)

**`vercel.json`** — add cron entry:
```json
{
  "path": "/api/cron/sync-sheets",
  "schedule": "0 */4 * * *"
}
```
(Every 4 hours. Adjust as needed.)

### 4. npm Dependencies

```bash
npm install googleapis
```

The `googleapis` package includes both the Sheets API client and `google-auth-library`.

---

## Auth Pattern

```typescript
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
```

---

## Failure Handling

- If the sync fails (network error, quota exceeded, etc.), log the error but do not affect any user-facing functionality. The Sheet is a backup, not critical path.
- Vercel cron logs will capture failures. Check Vercel Dashboard → Functions → `/api/cron/sync-sheets` if the Sheet appears stale.
- The "Last synced" timestamp in the Sheet makes it easy to tell if syncing has stopped.

---

## Future Expansion

Once the candidate pipeline sync is working, the same infrastructure can mirror:

| Tab | Data | Trigger |
|-----|------|---------|
| Candidates (per region) | Volunteer pipeline | Every 4 hours |
| Approved Volunteers | All active volunteers + police check status | Daily |
| Org Visits | Upcoming visits + registration counts | Daily or on-demand |
| Dormant Volunteers | Volunteers with no visit registrations in 60+ days | Weekly |

Each addition is just a new query + a new `clearAndWriteTab` call in the cron handler.
