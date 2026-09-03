# Sunshine App — Pilot Launch Plan

**Date:** September 2026
**Prepared by:** Ben Taylor
**Status:** Ready to launch

---

## Overview

The Sunshine App's organization visits system is ready to start handling real visits. This system is designed to replace the manual, spreadsheet-driven process Sunshine currently uses to coordinate therapy dog visits to schools, hospitals, care homes, and other institutions.

Rather than running a test with fake data, we're going to run the app **in parallel with the existing process** using real upcoming visits. The spreadsheet system stays primary, but a small group of volunteers and PDs will also see and interact with those same visits in the app, giving us real-world validation without disruption current operational process.

This approach gets us to production use faster and produces more meaningful feedback than a simulated test environment would.

---

## What the App Does

The full lifecycle of an organization visit:

1. Admin creates an organization record and submits a visit on their behalf
2. Admin or PD reviews and approves the visit, making it visible to volunteers
3. Volunteers browse nearby approved visits and sign up (or join a waitlist if full)
4. Admin or PD manages registrations, shares contact info with orgs when needed, adds notes
5. Visit occurs, admin marks it complete

Supporting systems:

- **Volunteer compliance** — uploading and tracking VSC certificates and dog vaccine records
- **PD regions** — geographic region assignment, scoped dashboards for Program Directors
- **Email notifications** — confirmation emails for visit signups, approvals, cancellations
- **Google Calendar integration** — automatic calendar events for approved visits
- **Mobile experience** — the app works on phones and tablets

---

## What's Not Included Yet

These features are planned for future phases:

- Invoicing and payment tracking
- Recurring/series visits
- Online payments (Stripe)
- The individual visits program (1:1 volunteer-to-individual matching — separate system, paused)
- Organization self-service accounts (orgs submitting their own visits through the app)

---

## Timeline

| Phase | Who | Target Dates | Description |
|-------|-----|-------------|-------------|
| **Pre-launch setup** | Ben | Sept 3-5 | Technical deployment, database migrations, environment verification |
| **Phase 1: Internal walkthrough** | Alanna + Ben | Week of Sept 8 | Alanna learns the admin workflows; Ben verifies technical systems and fixes issues |
| **Phase 2: Shadow period** | Alanna + 5-10 volunteers, 1-2 PDs | Weeks of Sept 15 & 22 | Real visits mirrored in the app alongside the existing spreadsheet process |
| **Phase 3: Evaluate** | Alanna + Ben | Week of Sept 29 | Review feedback, fix issues, decide on next steps |

**Target completion: end of September.**

---

## Pre-Launch Setup (Ben)

Technical steps required before any testing begins:

- [ ] Merge the `org-visits` branch to `main`
- [ ] Run all database migrations on the production Supabase instance
  - New tables: `visits`, `visit_registrations`, `visit_notes`, `pd_regions`, `pd_region_fsas`
  - New columns on `users` table (org profile fields, compliance fields, region assignment)
  - New columns on `dogs` table (vaccine record fields)
  - New role values: `organization`, `pd`
- [ ] Enable PostGIS extension on production Supabase
- [ ] Verify production environment variables (Google Calendar credentials, Resend API key)
- [ ] Seed initial PD regions and FSA (postal code area) prefixes
- [ ] Verify email sending works from the production domain
- [ ] Complete one full smoke test of every major flow

---

## Phase 1: Internal Walkthrough

**Duration:** ~1 week
**Participants:** Alanna (admin) + Ben (technical support)

This phase gets Alanna comfortable with the admin workflows before real volunteers are involved. It also serves as the final technical shakedown on the production environment.

### Alanna's Tasks (Admin Role)

- [ ] **Create managed organizations** — Enter a few real Sunshine partner organizations (names, addresses, contacts). These are admin-managed records — no org login needed.
- [ ] **Create test visits** — Enter a handful of visits with varied configurations to get familiar with the form:
  - Different dates, times, and locations
  - Different volunteer slot counts
  - Some requiring VSC, some not
- [ ] **Walk through the approval flow** — Approve visits, add admin notes
- [ ] **Set up PD regions** — Create regions, assign postal code areas, assign a PD
- [ ] **Manage registrations** — After Ben signs up as a test volunteer, practice managing registrations (view, remove, share contact info)
- [ ] **Review compliance** — View uploaded VSC and vaccine documents
- [ ] **Note feedback** — Anything confusing, unclear, or missing in the admin experience

### Ben's Tasks (Technical Verification)

- [ ] Register test volunteer and PD accounts to verify those flows
- [ ] Browse visits, sign up, upload compliance documents
- [ ] Verify email notifications arrive correctly
- [ ] Verify Google Calendar events are created
- [ ] Test on mobile
- [ ] Fix any blockers found

### Phase 1 Exit Criteria

- Alanna can create orgs, create visits, and manage the workflow without assistance
- Email notifications and Google Calendar integration are working
- No critical bugs

---

## Phase 2: Shadow Period

**Duration:** 2 weeks
**Participants:** Alanna (admin), 5-10 volunteers, 1-2 PDs

This is the core of the pilot. Alanna mirrors **real upcoming visits** in the app. Volunteers who are already assigned to those visits through the normal process are invited to also see and interact with them in the app.

The existing spreadsheet/manual process stays primary throughout. Nothing changes operationally — the app runs alongside it.

### How It Works

**Alanna's role:**
- [ ] Each week, enter the upcoming week's real visits into the app as managed org visits
- [ ] Use real organization names, addresses, dates, times, and slot counts
- [ ] Approve visits so they become visible to volunteers
- [ ] Manage registrations as volunteers sign up — compare against the spreadsheet to verify accuracy
- [ ] Note any gaps: does the app capture everything the spreadsheet does? What's missing?

**Volunteer testers:**
- Recruited from volunteers who are already scheduled for upcoming visits
- They register in the app, complete their profile, and upload compliance documents
- They find and sign up for visits they're already committed to through the normal process
- They experience the app flow with real, meaningful context — not a simulation

**PD testers:**
- 1-2 PDs are invited once volunteers are active in their region
- They view their scoped dashboard with real visits and real volunteers
- Brief walkthrough with Alanna is sufficient — no elaborate pre-staged environment needed

### What Volunteers Are Asked To Do

Testers receive a brief invitation with a link to the app and these instructions:

1. **Register and set up your profile** — Create an account, add your details and your dog's information
2. **Upload your compliance documents** — Your VSC certificate and your dog's vaccine records
3. **Find your upcoming visit** — Browse visits near you and sign up for one you're already attending
4. **Check your notifications** — Did you receive a confirmation email? A calendar invite?
5. **Try it on your phone** — Open the app on your mobile device
6. **Let us know what you think** — Fill out the short feedback form

### What PDs Are Asked To Do

1. **Register and get approved** — Create a PD account (Alanna approves it)
2. **Explore your dashboard** — View visits, volunteers, and organizations in your region
3. **Toggle My Region / All** — See the scoping in action
4. **Share your impressions** — Is this useful? What's missing compared to your current tools?

### Feedback Collection

A short feedback form (Google Form or similar) covering:

1. Was registration and profile setup straightforward?
2. Could you find and sign up for visits easily?
3. Did you receive email notifications? Were they clear?
4. How was the experience on your phone?
5. Was anything confusing, broken, or missing?
6. How does this compare to the current process?
7. Would you use this app regularly?
8. Any other comments?

---

## Phase 3: Evaluate

**Duration:** ~1 week

After the shadow period:

1. **Compile feedback** from the form, Alanna's notes, and any informal conversations
2. **Categorize findings:**
   - Bugs — broken functionality
   - Workflow gaps — things the spreadsheet handles that the app doesn't yet
   - UX issues — works but confusing
   - Feature requests — nice-to-haves for later
3. **Fix critical issues**
4. **Decide on next steps:**
   - If the app captured the visit workflow accurately and feedback is positive: **begin transitioning to the app as primary** for new visits
   - If workflow gaps were found: address them and run another shadow period
   - If major concerns were raised: revisit the approach with Alanna

---

## Success Criteria

The pilot is successful if:

- **The app mirrors reality** — Visits entered in the app match what's happening in the spreadsheet; no data or workflow gaps that would prevent the app from being primary
- **Registration works** — Volunteers and PDs can create accounts and complete profiles without help
- **Core visit flow works** — Volunteers can browse, sign up for, and cancel visits reliably
- **Compliance works** — Document uploads function correctly; VSC requirements are enforced
- **PD scoping works** — Program Directors see a dashboard scoped to their region
- **Communications work** — Email notifications and Google Calendar invites arrive consistently
- **Admin workflow works** — Alanna can manage the full visit lifecycle through the app
- **No critical bugs** — No data loss, crashes, or security issues
- **Positive reception** — Testers see the value compared to the current manual process

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Database migrations fail on production | Test full migration sequence on dev first; have rollback plan ready |
| Email deliverability issues | Verify Resend domain setup; send test emails before inviting anyone |
| Volunteers confused about app vs. real schedule | Clear communication that the spreadsheet is still primary; the app is a parallel view |
| Low tester engagement | Keep the group small and personally recruited; use volunteers already on upcoming visits so the context is real |
| Major bugs discovered during shadow period | Ben available for quick fixes throughout |

---

## What Comes After

If the pilot goes well, the path to full production use:

- **Immediate:** Fix issues found during the pilot, address workflow gaps
- **Short-term:** Stop mirroring — start using the app as the primary system for new visits. Spreadsheet becomes the backup.
- **Near-term:** Invoicing system, invite more volunteers, potentially onboard real org accounts
- **Later:** Automated reminders, recurring visits, compliance expiry alerts, statistics
- **Future:** Online payments, native mobile app, individual visits program revival

The full feature roadmap is in [FUTURE_FEATURES.md](future/FUTURE_FEATURES.md).
