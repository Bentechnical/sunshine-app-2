# Volunteer Onboarding Pipeline

> **Status:** Planned — not yet built
> **Goal:** Replace the Volunteer Master List spreadsheet + BCC email workflow so PDs manage the entire candidate pipeline from the app.

---

## The Core Constraint

**Do not create parallel systems.**

Any feature that only partially replaces the spreadsheet forces PDs to maintain both the app AND the spreadsheet simultaneously — making their workload worse, not better. The minimum viable unit of work is the complete candidate pipeline: all 5 stages must be in the app before PDs can stop using the spreadsheet.

---

## What the Spreadsheet Currently Tracks

The Volunteer Master List has a per-region Candidates tab. Each row is one candidate:

| Spreadsheet Column | Current Values | App Today |
|-------------------|----------------|-----------|
| Name + dog name | "Tanya & Marvin" | `users` + `dogs` tables |
| Region | Durham | `users.assigned_region_id` |
| Breed | Golden Retriever | `dogs.dog_breed` |
| Phone | 416-... | `users.phone_number` |
| Email | ... | `users.email` |
| Date of birth | 07/13/1975 | **Missing** |
| Interviewed | "Awaiting - reached out 04/01" or date | **Missing** |
| Dog assessed | "Awaiting" or date + outcome code | **Missing** |
| Police check | "Awaiting" or date | Partial (`vsc_document_url`, `vsc_date_issued`) |
| Probation visits | 0 / ½ / Approved | **Missing** |
| Notes | Free text | **Missing** |

---

## The Candidate Journey (What the PD Guide Documents)

```
Application submitted
       |
  PD notified by email
       |
  Phone interview scheduled (PD arranges externally)
       |
  Interview outcome recorded: proceed / waitlist / decline
       |
  Candidate invited to assessment session (currently BCC email)
       |
  Candidate picks time slot (currently reply-to-email)
       |
  Assessment day: dog evaluated by trainer
       |
  Outcome recorded:
    Pass           → approved, start probation tracking
    Conditional Pass → approved, first 2 visits must be supervised
    Retest         → stays on candidate list, invited to next session
    Fail           → denied, no further action
       |
  Probation tracking: 0 → ½ → Approved
       |
  Emergency contact collected (currently via email reply)
       |
  Fully active volunteer
```

---

## What Needs to Be Built

### 1. PD Email Notification on New Application
When a volunteer completes their profile in a PD's region, send the PD an email.

- **Effort:** Small (single email trigger)
- **Replaces:** PDs manually checking the app for new pending users
- **Files:** Modify volunteer profile completion API, add email template

---

### 2. Candidate Pipeline View
New "Candidates" tab in the PD dashboard — a table showing all candidates in the PD's region.

**Columns:** Name, dog, applied date, interview status, assessment status, probation status, police check status, notes

- Sortable/filterable
- Row expand: edit stage, record interview, add notes
- **Effort:** Medium (new component + API routes)
- **Replaces:** The entire Candidates spreadsheet tab
- **Files:** New `AdminCandidates.tsx`, `/api/admin/candidates/` routes, update `pd/page.tsx`

---

### 3. Interview Tracking
Within the candidate row, PD records the interview outcome.

- **Fields:** Interview date, outcome (proceed / waitlist / decline), free-text notes
- No scheduling integration — PD arranges the interview externally, just records the result
- **Effort:** Small (fields on existing candidate row)
- **Replaces:** Spreadsheet "Interviewed" column + Google Doc interview notes

---

### 4. Assessment Sessions + Time-Slot Registration
PD creates an assessment session; candidates register for a time slot.

**PD side:**
- Create session: date, time, location, slot duration (default 30 min), max per slot (default 4 dogs)
- "Invite Candidates" → select candidates → sends email with registration link
- See registrations in real time

**Candidate side:**
- Public/semi-public registration page (no login required)
- Pick an available time slot
- Confirmation email sent

**Automation:**
- Reminder email sent automatically 7 days before the session (cron job)

- **Effort:** Largest piece (new session model, registration page, email flow, cron)
- **Replaces:** BCC email chain and sign-up-by-reply-email workflow
- **Files:** New `AdminAssessments.tsx`, `/api/admin/assessments/` routes, `/api/public/assessment-register/` route, public registration page

---

### 5. Assessment Outcome Recording
After the session, PD marks each registrant's result.

| Outcome | What Happens |
|---------|-------------|
| Pass | Approval email + welcome package sent; `status = approved`; probation tracking starts |
| Conditional Pass | Same as pass, but first 2 probation visits must be supervised; flag set |
| Retest | Candidate stays on list; eligible for next session |
| Fail | `status = denied`; no further action |

- **Effort:** Medium
- **Replaces:** Post-assessment spreadsheet update + manual approval emails

---

### 6. Probation Visit Tracking
Per-volunteer field visible in PD dashboard: `0` / `½` / `Approved`

- PD manually updates after receiving feedback from visit supervisor
- Conditional pass volunteers: flag shown on visit signup so supervisor knows extra oversight is needed
- Volunteer dashboard: shows "Action Required" prompt if probation not yet complete
- **Effort:** Small
- **Replaces:** "Probation Visits Completed" spreadsheet column

---

### 7. Emergency Contact Collection
After assessment pass, volunteer dashboard shows an "Action Required" card.

- Fields: emergency contact name + phone number
- Stored on the volunteer's profile
- **Effort:** Small
- **Replaces:** Email reply collection of emergency contacts

---

## Database Changes Required

### New columns on `users`

```sql
ALTER TABLE users ADD COLUMN date_of_birth DATE;
ALTER TABLE users ADD COLUMN interview_date DATE;
ALTER TABLE users ADD COLUMN interview_outcome TEXT;  -- 'proceed' | 'waitlist' | 'decline'
ALTER TABLE users ADD COLUMN interview_notes TEXT;
ALTER TABLE users ADD COLUMN probation_status TEXT DEFAULT '0';  -- '0' | 'half' | 'approved'
ALTER TABLE users ADD COLUMN probation_notes TEXT;
ALTER TABLE users ADD COLUMN probation_supervised BOOLEAN DEFAULT false;  -- conditional pass flag
ALTER TABLE users ADD COLUMN emergency_contact_name TEXT;
ALTER TABLE users ADD COLUMN emergency_contact_phone TEXT;
ALTER TABLE users ADD COLUMN candidate_stage TEXT DEFAULT 'applied';
-- stages: applied | interviewed | assessment_waitlisted | assessment_invited | assessment_registered | assessed | onboarding | active
```

### New tables

```sql
CREATE TABLE assessment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id INT REFERENCES pd_regions(id),
  created_by TEXT REFERENCES users(id),
  session_date DATE NOT NULL,
  session_time TIME,
  location TEXT,
  notes TEXT,
  slot_duration_minutes INT DEFAULT 30,
  max_per_slot INT DEFAULT 4,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE assessment_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES assessment_sessions(id),
  volunteer_id TEXT REFERENCES users(id),
  timeslot TIME,
  outcome TEXT,  -- 'pass' | 'conditional_pass' | 'retest' | 'fail' | NULL (pending)
  outcome_notes TEXT,
  no_show BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Email Templates Required

| Template | Trigger |
|----------|---------|
| New candidate notification | Volunteer completes profile in PD's region |
| Assessment invitation | PD invites candidate to a session |
| Assessment registration confirmation | Candidate picks a time slot |
| Assessment reminder | 7 days before session (cron) |
| Approval / welcome package | Assessment outcome = pass or conditional pass |
| Denial notification | Assessment outcome = fail |

---

## Out of Scope (Explicitly)

These stay in their current external tools:

| Item | Reason |
|------|--------|
| Google Drive candidate folders (signed agreements, legacy docs) | App handles new uploads; Drive remains for legacy documents |
| Personalized police check letters (region-specific PDFs) | PDs keep generating manually; PDF generation complexity not worth it now |
| Annual AOD form (December re-declaration) | Currently Google Forms; in-app version deferred |
| MailChimp mailing list | ED/Alan manage externally |
| Assessment trainer coordination | Alan/ED coordinate externally; app just provides the session container |
| T-shirts and bandanas | Physical logistics |

---

## Suggested Build Order

Each step is self-contained and delivers value before the next starts.

| Step | Feature | Replaces |
|------|---------|---------|
| 1 | PD email notification on new application | Manual monitoring |
| 2 | Candidate pipeline view + interview tracking | Spreadsheet columns A–H |
| 3 | Assessment sessions + time-slot registration | BCC email + sign-up-by-reply |
| 4 | Assessment outcome recording | Post-assessment spreadsheet update + approval emails |
| 5 | Probation visit tracking | Spreadsheet "Probation Visits" column |
| 6 | Emergency contact collection | Email reply collection |

At the end of step 6, PDs can run the entire candidate pipeline from the app. The spreadsheet becomes optional backup rather than the system of record.

---

## Verification Checklist (Per Step)

After each step, confirm:
- [ ] PD can perform the equivalent workflow in the app that they previously did in the spreadsheet
- [ ] All data the PD needed from the spreadsheet is visible in the app
- [ ] No information is being lost vs. the spreadsheet (cross-check column by column)
- [ ] Email notifications arrive with the correct content
- [ ] A new PD with no spreadsheet access could fully manage their region using the app alone
