# Sunshine App Redesign: Team Brief
**Meeting Date:** January 27, 2026
**Prepared By:** Ben Taylor
**Purpose:** Discuss major redesign, get feedback, align on approach

---

## TL;DR - What's Changing?

We're removing the rigid availability system and moving to a **dating-app-style matching system** where users connect via chat and coordinate meeting details conversationally.

**Why?** User feedback over 1-2 months with ~100 active users shows:
- Availability system is awkward, rigid, and unintuitive
- 12-week recurring patterns are confusing
- Doesn't allow flexible time suggestions
- Volunteers sign up once and never return

**The Fix:** Let users browse profiles, send chat requests, and schedule via conversation instead of pre-set time slots.

---

## Current System vs. New System

### How It Works Today

```
Individual Journey:
1. Browse dogs → See available time slots
2. Click slot → Manually type time (e.g., "3pm")
3. Submit request → Wait for volunteer email
4. Volunteer approves → Chat opens + appointment confirmed

Volunteer Journey:
1. Set up weekly availability (12-week recurring pattern)
2. Wait for requests
3. Approve/decline via email or dashboard
4. Many volunteers: set availability once, never return
```

**Problems:**
- ❌ Rigid time slots don't match real schedules
- ❌ 12-week template is complex and confusing
- ❌ Volunteers with no requests feel disengaged
- ❌ Individuals can't suggest alternative times
- ❌ Manual time entry leads to errors

---

### How It Will Work (New System)

```
Individual Journey:
1. Browse dogs → See volunteer's general availability note
   (e.g., "Usually free weekends and Thursday afternoons")
2. Click "Request to Chat"
3. Volunteer accepts → Chat opens
4. Discuss times via chat
5. Either party clicks "Schedule Appointment" in chat
6. Fill quick form (date, time, location)
7. Other party confirms → Appointment scheduled

Volunteer Journey:
1. Complete profile with optional general availability note
2. Browse individuals in their area ("Connect with People" tab)
3. Send chat requests proactively
4. Respond to incoming requests
5. Coordinate appointments via chat
```

**Benefits:**
- ✅ Flexible, conversational scheduling
- ✅ Volunteers stay engaged (can browse people)
- ✅ Either party can initiate contact
- ✅ Simpler onboarding (no availability setup)
- ✅ Natural conversation about logistics

---

## Key Features

### 1. Bidirectional Search

**Both users can now browse and initiate:**

| Role | What They See | What They Do |
|------|---------------|--------------|
| **Individual** | Directory of therapy dogs | Send chat request to volunteer |
| **Volunteer** | Directory of individuals | Send chat request to individual |

**Why bidirectional?**
- Keeps volunteers engaged when they have availability
- Allows volunteers to reach out to people they resonate with
- Creates more matching opportunities

### 2. Two-Step Chat Request

**Before users can chat, a request must be accepted:**

```
Step 1: User A sends "Request to Chat"
    ↓
Step 2: User B receives notification (email + in-app)
    ↓
Step 3: User B accepts → Chat opens
    OR
    User B declines → User A is notified
```

**Why not immediate chat?**
- Respects both parties' time
- Prevents spam
- Volunteers can review profile before accepting

### 3. In-Chat Appointment Scheduling

**Once chat is open, either party can schedule:**

```
[Schedule Appointment] button in chat
    ↓
Quick 3-step wizard:
    1. Date & Time (date picker, time dropdown)
    2. Location (individual's address, public, or other)
    3. Notes (optional)
    ↓
Other party receives proposal
    ↓
Confirm, Suggest Changes, or Decline
    ↓
If confirmed: Appointment scheduled ✓
```

**Features:**
- Either party can propose
- Other party must confirm
- Can modify or cancel later
- Formal appointment record for admin oversight

### 4. Profile Visibility

**What information is visible when browsing?**

| Info Type | Individual Profile | Volunteer Profile |
|-----------|-------------------|-------------------|
| Name | First name only | First name + last initial |
| Photo | Profile pic or avatar | Dog photo + owner pic |
| Location | City only | City only |
| Bio | Reason for visit | About me & dog |
| Availability | N/A | General text (e.g., "Weekends") |
| Contact Info | ❌ Hidden | ❌ Hidden |

**Privacy:** Last names, phone, email, full address always hidden (only admins see)

---

## What We're Removing

### Entire Availability Management System

**Deleting:**
- Weekly recurring availability templates
- 12-week pattern generation
- Time slot management
- Availability calendar view
- "Manage Availability" tab
- ~2,500 lines of code

**Impact on existing users:**
- Volunteers will lose their set availability slots
- Existing appointments will be preserved
- Need to communicate this change clearly

---

## Technical Scope

### Database Changes
- ✅ Add `general_availability` text field to user profiles
- ✅ Create `chat_requests` table (pending/accepted/declined)
- ✅ Modify `appointments` table (add location, notes, proposal fields)
- ❌ Delete `appointment_availability` table
- ✅ Create new search functions for bidirectional matching

### New Components (~4,500 lines)
- Individual directory (volunteers browse people)
- Chat request button & pending requests view
- Schedule appointment wizard (3-step modal)
- Appointment confirmation UI in chat
- Modify/cancel appointment flows

### Modified Components (~3,000 lines)
- Dog directory (remove availability, add chat request)
- Volunteer dashboard (remove availability management)
- Messaging tab (add scheduling button)
- My Visits page (update for new appointment schema)

### Removed Code (~2,500 lines)
- All availability management components
- Availability-related API endpoints
- Old appointment request logic

**Net Change:** ~5,000 lines added/changed, ~50-60% of core functionality

---

## Timeline & Effort

### Estimated Development Time
**6-8 coding sessions** (2-3 hours each)
**Total: 12-24 hours of focused development**

### Breakdown by Phase
1. **Database migration** (1 session, 2-3 hours)
2. **Individual directory** (1 session, 3-4 hours)
3. **Chat request flow** (1 session, 3-4 hours)
4. **Appointment scheduling wizard** (2 sessions, 4-5 hours)
5. **Modify/cancel flows** (1 session, 2-3 hours)
6. **Dashboard & email updates** (1 session, 2-3 hours)
7. **Testing & polish** (1 session, 3-4 hours)

### Calendar Timeline
- **Week 1:** Database migration, remove old code
- **Week 2:** Build individual directory, chat requests
- **Week 3:** Appointment scheduling wizard
- **Week 4:** Testing, bug fixes, deployment

**Target Launch:** ~4 weeks from start

---

## Risks & Mitigation

### Risk 1: User Confusion
**Problem:** Existing users accustomed to old system

**Mitigation:**
- Email all users 1 week before launch
- Explain changes clearly
- Provide tutorial/walkthrough on first login
- Monitor support tickets closely for first 2 weeks

### Risk 2: Volunteer Overwhelm
**Problem:** Popular volunteers get too many chat requests

**Mitigation (MVP):**
- Start without limits, monitor usage
- If needed: Add max 5 pending requests per user
- Future: "Pause profile" toggle

### Risk 3: Less Structure = Less Accountability
**Problem:** Without formal time slots, meetings might be more informal

**Mitigation:**
- Keep formal appointment records in database
- Require confirmation from both parties
- Admin can still see all appointments
- Track no-shows (future feature)

### Risk 4: Data Migration Issues
**Problem:** Bugs during database migration could corrupt data

**Mitigation:**
- Full database backup before deployment
- Test migration on dev environment with production-like data
- Rollback plan documented
- Deploy during low-traffic time (Sunday 2 AM)

### Risk 5: Timeline Slippage
**Problem:** Scope creep, unforeseen bugs

**Mitigation:**
- Stick to MVP (defer nice-to-haves)
- Phase releases if needed
- Clear definition of "done" for each phase

---

## MVP vs. Future Features

### In Scope for MVP ✅
- ✅ Remove availability system
- ✅ Bidirectional search (individuals browse dogs, volunteers browse individuals)
- ✅ Two-step chat request (pending → accepted)
- ✅ In-chat appointment scheduling wizard
- ✅ Modify and cancel appointments
- ✅ Email notifications for all key actions
- ✅ General availability text field (optional)

### Deferred to Future 📅
- ⏸️ Profile visibility toggle (users can hide from search)
- ⏸️ Chat request limits (max 5 pending)
- ⏸️ Multiple appointments per chat (MVP: only 1 at a time)
- ⏸️ Double-booking prevention (volunteers manage own calendar)
- ⏸️ Advanced filters (age, frequency, dog breed)
- ⏸️ No-show tracking and ratings
- ⏸️ Calendar export (.ics files)
- ⏸️ In-app push notifications

**Philosophy:** Ship MVP fast, iterate based on real user feedback

---

## User Communication Plan

### Email to Volunteers (1 Week Before Launch)

**Subject:** Important Update: New Way to Connect with Individuals

**Key Points:**
- Explain why we're changing (user feedback, simpler system)
- What's new: browse individuals, chat-based scheduling
- What's going away: weekly availability templates
- What they need to do: add general availability note (optional)
- Reassure: existing appointments are safe
- Provide support contact

### Email to Individuals (1 Week Before Launch)

**Subject:** Exciting Update: More Ways to Connect with Therapy Dogs

**Key Points:**
- Easier to connect with volunteers (chat instead of time slots)
- More flexible scheduling (discuss times that work)
- Better matches (more active volunteers)
- How it works: browse, request chat, coordinate

### In-App Announcement (On First Login After Launch)

**Modal/Banner:**
```
🎉 Welcome to the New Sunshine App!

We've made it easier to connect:
- Browse and chat with volunteers directly
- Coordinate visit times through conversation
- More flexible scheduling

[Take a Quick Tour] [Skip]
```

---

## Success Metrics

### What We'll Track

**Engagement:**
- Chat request acceptance rate (target: >60%)
- Appointment confirmation rate (target: >70%)
- Time from chat → confirmed appointment (target: <48 hours)
- Volunteer weekly active rate (baseline: 25%, target: 40%)

**User Satisfaction:**
- Post-visit survey ratings (target: 4+ stars)
- Support tickets about scheduling (target: <5/week)
- User retention after 30 days (target: >50%)

**System Health:**
- API response time (target: <500ms)
- Email delivery rate (target: >98%)
- Database query performance (target: <200ms avg)

### How We'll Measure Success

**Week 1:**
- No critical bugs
- <10 support tickets
- >50% of users try new chat feature

**Week 4:**
- Chat → appointment conversion rate >60%
- Volunteer engagement up >10%
- Positive user feedback

**Month 3:**
- Volunteer retention up >15%
- Total appointments per month up >20%
- User satisfaction rating 4+ stars

---

## Additional Features to Consider

### NEW: Volunteer Activity Tracking & Trust Signals

**Proposal:** Display volunteer stats on profiles to build trust and encourage participation

**What to include (for discussion):**

**Definite YES for MVP:**
- ✅ **Total visits completed** (e.g., "23 visits") - builds trust, shows legitimacy
- ✅ **Active status badge** (e.g., "Active this week" if logged in last 7 days) - shows volunteer is engaged

**To Discuss:**
- ❓ **"Member since" date** - Problem: All users will show same launch date initially. Could manually set for legacy users, but requires admin override mechanism. Worth the complexity?
- ❓ **Response time** (e.g., "Usually responds within 4 hours") - Shows responsiveness, but adds tracking complexity. Defer to v2?

**Implementation:** Simple count from appointments table + last_active_at timestamp. +1-2 hours effort.

**Decision needed:** Confirm visits + active badge for MVP. Decide on member_since and response_time.

---

### NEW: Chat Request Decline Behavior

**Question:** What happens when someone declines a chat request?

**Scenario:**
- Individual sends chat request to volunteer
- Volunteer declines
- What does individual see? Can they request again?

**Recommended Approach: Smart Hiding (Option C)**
- Declined user receives: "Sarah is unable to connect at this time. Don't worry - there are plenty of other great matches!"
- Decliner's profile **automatically hidden from requester's search for 30 days**
- After 30 days, profile reappears (circumstances may have changed)
- Prevents spam, reduces volunteer overwhelm, spares requester from repeated rejection

**Why this approach:**
- ✅ Protects volunteers from repeated unwanted requests
- ✅ Prevents awkward "why does this person keep declining me?" situation
- ✅ Automatic cooldown period (no manual blocking needed)
- ✅ Empathetic messaging (doesn't feel personal)

**Implementation:** Filter declined users from search results for 30 days. Add `declined_at` timestamp to `chat_requests` table.

**Decision needed:** Approve this approach for MVP?

---

## Open Questions for Team Discussion

### 1. Profile Opt-In/Opt-Out
**Question:** Should individuals be able to hide their profile from volunteer search?

**Options:**
- **A) Auto opt-in:** All approved individuals appear in search (MVP approach)
- **B) Optional toggle:** Users can turn off "Show in search" in settings

**Trade-offs:**
- A is simpler, maximizes matches
- B gives users more control, may reduce matches

**Decision needed:** A for MVP, add B later if users request?

---

### 2. Multiple Appointments Per Chat
**Question:** Can users schedule multiple future appointments in same chat?

**Context:** Popular individuals might get 10+ requests

**Options:**
- **A) No limits (MVP):** Trust users to manage, monitor usage
- **B) Soft limit:** Hide profile after 5 pending requests
- **C) Hard limit:** Prevent new requests after 5 pending

**Trade-offs:**
- A is simplest, might overwhelm popular users
- B/C prevents overwhelm, might frustrate volunteers

**Decision needed:** A for MVP, add limits if needed?

---

### 3. Chat Request Limits (Future Consideration)
**Question:** Should we limit how many pending chat requests a user can have?

**Context:** Popular individuals might get 10+ requests

**Options:**
- **A) No limits (MVP):** Trust users to manage, monitor usage
- **B) Soft limit:** Hide profile after 5 pending requests
- **C) Hard limit:** Prevent new requests after 5 pending

**Trade-offs:**
- A is simplest, might overwhelm popular users
- B/C prevents overwhelm, might frustrate volunteers

**Decision needed:** A for MVP, add limits if needed?

---

### 4. Multiple Appointments Per Chat (Already Decided)
**Decision:** One at a time for MVP

**Question:** Can users schedule multiple future appointments in same chat?

**Options:**
- **A) One at a time (MVP):** Only 1 active/future appointment per chat
- **B) Unlimited:** Users can schedule weekly visits all at once

**Trade-offs:**
- A is simpler to build, enforces one-at-a-time flow
- B is more convenient for recurring visits

**Decision needed:** A for MVP, easy to change to B later?

---

### 5. Volunteer Proactivity - Expected Behavior?
**Question:** How much should we encourage volunteers to proactively reach out?

**Context:** New "Connect with People" tab might create expectation

**Considerations:**
- Do volunteers feel obligated to send requests?
- Is it empowering or burdensome?
- Should we set expectations in volunteer onboarding?

**Discussion needed:** How do we position this feature?

---

### 6. Individual Profile Content
**Question:** What should individuals include in their profile for volunteers to see?

**Current fields:**
- First name, pronouns, city, bio
- Visit recipient (self vs. dependent)
- Maybe: age, gender

**Questions:**
- Should we add new fields (interests, hobbies, visit goals)?
- Is current bio sufficient?
- What helps volunteers decide who to reach out to?

**Discussion needed:** Profile optimization for matching?

---

### 7. Deployment Strategy
**Question:** Big bang launch or phased rollout?

**Options:**
- **A) Big bang:** Everyone gets new system at once
- **B) Beta group:** Test with 20 users first, then full launch
- **C) Feature flag:** New users get new system, old users grandfathered

**Trade-offs:**
- A is fastest, highest risk
- B reduces risk, adds complexity
- C most complex, allows gradual transition

**Decision needed:** A (with good testing) or B?

---

### 8. Tab Naming
**Question:** What should we call the new tabs?

**Current proposal:**
- Individuals: "Connect with Dogs" (was "Meet with Dog")
- Volunteers: "Connect with People" (was "Manage Availability")

**Alternatives:**
- "Find a Dog" / "Find People"
- "Browse Dogs" / "Browse Individuals"
- "Discover Dogs" / "Discover People"

**Feedback wanted:** Do these names feel warm and human-focused?

---

## Meeting Agenda

**Suggested Flow:**

### Part 1: Context (10 min)
- Review user feedback on current system
- Show pain points from user testing
- Explain why redesign is needed

### Part 2: Proposal (15 min)
- Walk through new user flow (individual & volunteer)
- Show mockups/diagrams (see next section)
- Explain key features

### Part 3: Scope & Timeline (10 min)
- Technical overview (high-level)
- 6-8 sessions, ~4 weeks
- Database migration strategy

### Part 4: Discussion (20 min)
- Go through 7 open questions above
- Get feedback on approach
- Surface concerns or missing considerations

### Part 5: Next Steps (5 min)
- Agree on MVP scope
- Assign decision-makers for open questions
- Set checkpoints for progress updates

**Total:** 60 minutes


---

## Appendix: Technical Details (For Reference)

### Database Changes Summary
```sql
-- New table for chat requests
CREATE TABLE chat_requests (
  id UUID PRIMARY KEY,
  requester_id UUID,
  recipient_id UUID,
  dog_id UUID,
  status TEXT,  -- pending/accepted/declined
  created_at TIMESTAMPTZ
);

-- Modify appointments table
ALTER TABLE appointments
ADD COLUMN location_type TEXT,
ADD COLUMN location_details TEXT,
ADD COLUMN duration_minutes INTEGER,
ADD COLUMN notes TEXT,
ADD COLUMN proposed_by UUID;

-- Add to users table
ALTER TABLE users
ADD COLUMN general_availability TEXT;

-- Delete availability table
DROP TABLE appointment_availability;
```

### API Endpoints Summary
```
New:
POST   /api/chat/request           - Send chat request
POST   /api/chat/accept            - Accept chat request
POST   /api/chat/decline           - Decline chat request
POST   /api/appointment/propose    - Propose appointment
POST   /api/appointment/confirm-proposal - Confirm proposal
POST   /api/appointment/modify     - Modify appointment
GET    /api/individuals/search     - Volunteer browses individuals

Modified:
POST   /api/appointment/confirm    - Updated for new schema
POST   /api/appointment/cancel     - Remove availability logic

Deleted:
POST   /api/request                - Old request flow
GET    /api/admin/availabilities   - No longer needed
```

---

## Quick Decisions Needed

**New Features (from discussion above):**
1. ✅ Include visit count badge for volunteers? (Recommended: YES)
2. ✅ Include "Active this week" badge? (Recommended: YES)
3. ❓ Include "Member since" date? (Issue: all users same date, need admin override?)
4. ❓ Include response time stat? (Issue: adds complexity, defer to v2?)
5. ✅ Use "Smart Hiding" for declined requests? (Recommended: YES - 30 day cooldown)

**Other Open Questions:**
6. ❓ Profile opt-in toggle for individuals (hide from search)? - MVP: auto opt-in, add toggle later if requested
7. ❓ Chat request limits (max 5 pending)? - MVP: no limits, monitor and add if needed
8. ❓ Tab naming: "Connect with People" ok, or need alternatives?

A