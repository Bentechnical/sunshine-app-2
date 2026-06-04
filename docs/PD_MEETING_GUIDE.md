# PD Research Meeting Guide

> **Format:** Research/interview session — no demo. You're here to understand their job, not to present yours.
> **Attendees:** Executive Director + one Program Director
> **Goal:** Understand actual workflow and pain points across all areas — candidate management, active volunteer coordination, org visits, communication — and validate (or correct) current assumptions before building more.

---

## The Right Mindset Going In

This is not a product review. It's a discovery session.

Avoid leading questions ("Would it help if the app could do X?") — people will say yes to almost anything hypothetical. Instead, ask about what they actually did last week. Real behavior is more useful than stated preferences.

The most valuable thing you can do is stay quiet and let them talk. Take notes. The specific language they use to describe frustration is useful later — both for knowing what to build and for knowing what to call things in the UI.

---

## Suggested Opening

> "I want to make sure that what I build actually fits how you work, rather than adding another system you have to maintain. So before anything else — can you walk me through what volunteer management actually looked like for you last week? What did you open, what did you do, what took longer than it should?"

Let that run. Don't interrupt to confirm your assumptions. Just listen and follow threads.

---

## The Domains to Cover

You don't need to ask about each of these separately — "walk me through your week" will touch most of them naturally. But use this list to notice what they *don't* mention, and follow up.

### A. Candidate Pipeline (new applicants → active volunteers)
What you think you know: PDs manage candidates via a Volunteer Master List spreadsheet (interview dates, assessment dates, police check status, probation visits). The current app is missing most of this.

**Assumptions to check:**
- Is the spreadsheet their daily operational tool, or do they use it infrequently?
- How many candidates is a typical PD managing at once?
- What does a "bad week" look like for candidate management — what falls through the cracks?
- Is the interview scheduling itself painful, or just the tracking of outcomes?
- How does the assessment sign-up actually work in practice — is the BCC email chain a real friction point?
- Who besides the PD looks at the spreadsheet? Does ED check it directly?

### B. Active Volunteer Coordination
What you think you know: Once approved, volunteers sign up for visits independently. PDs track probation status (0 / ½ / Approved) and follow up with dormant volunteers.

**Assumptions to check:**
- How do PDs currently know which volunteers are inactive or dormant?
- How often do PDs communicate with active volunteers, and how?
- Is the police check / VSC renewal process a real ongoing burden, or does it mostly handle itself?
- Do PDs feel they have visibility into what their volunteers are doing, or is it a black box?

### C. Org Visits
What you think you know: Organizations request visits, volunteers sign up for slots, PDs have some oversight role.

**Assumptions to check:**
- Are PDs involved in org visit coordination, or is that mostly the ED / org-facing?
- Do PDs see the current org visit system in the app? Have they used it?
- Is matching volunteers to org visits a manual process? Who does it?
- What does an org visit going wrong look like — and whose problem is it to fix?

### D. Communication
What you think you know: Most communication happens via email (Gmail templates). Volunteers receive notifications for appointments and visits.

**Assumptions to check:**
- How much email does a PD send/receive per week related to volunteers?
- Do volunteers contact PDs directly? On what channel?
- Are there recurring emails that feel like they shouldn't have to be manual?
- Do volunteers contact each other, or does all coordination go through the PD?

### E. Reporting and Oversight (mostly for ED)
What you think you know: ED uses the Volunteer Master List to get a cross-regional view. There's no real-time reporting in the app today.

**Assumptions to check:**
- What decisions does ED actually make using the spreadsheet data?
- How often does ED ask PDs for status updates? How does that feel to the PD?
- What would ED want to see at a glance that they currently have to ask for?

---

## Targeted Questions to Keep in Reserve

If the conversation stalls or misses a domain, these can re-open it:

- "What's most likely to fall through the cracks? Has that actually happened?"
- "If you handed your region off to someone tomorrow, what would be hardest to explain?"
- "What tools do you use right now that actually work well — things you'd be sad to lose?"
- "What would have to be true for the spreadsheet to feel optional rather than essential?"
- "Is there anything volunteers ask you repeatedly that they should be able to find themselves?"
- "What's the first thing you do on a Monday morning related to this role?"

---

## The One Constraint Worth Naming Explicitly

At some point, say this:

> "One thing I'm being careful about is not building something that means you have to maintain both the app and the spreadsheet at the same time. That would make your life worse. So I want to understand exactly what it would take for the spreadsheet to become something you check occasionally rather than something you rely on every day."

This shows you understand the real risk. It also invites them to be honest about what the spreadsheet does that the app currently doesn't.

---

## What the ED and PD Probably Want Differently

Worth being aware of going in — they may not have the same priorities:

| | ED | PD |
|--|----|----|
| Primary concern | Org-wide visibility and compliance | Daily workflow efficiency |
| Biggest frustration (likely) | Having to ask PDs for status; no single view of pipeline health | Manual data entry; email volume; juggling spreadsheet + email + Drive |
| What success looks like | Opening the app (or a Sheet) and seeing cross-regional pipeline status without asking anyone | Not having to copy data between systems; fewer repetitive emails |
| Risk to watch for | May want features for their own oversight that don't actually help PDs | May want to keep existing tools out of habit even if app is better |

If their priorities conflict, note it — don't try to resolve it in the room.

---

## Closing the Meeting

Leave 5–10 minutes for this:

> "This has been really helpful. Based on what you've told me, here's what I'm hearing as the highest-priority pain points: [summarize 2–3 things]. Does that match what you'd say, or is something else actually the biggest issue?"

Then:
> "I'll come back to you with a revised plan based on this conversation before I build anything new. If there's anything else that comes to mind after today, feel free to send it my way."

Don't commit to features or timelines in the room. You won't have enough information until you've had a chance to reflect on the notes.

---

## After the Meeting

- Write up what you heard while it's fresh — especially direct quotes
- Note what they *didn't* mention (sometimes as telling as what they did)
- Flag any assumptions the conversation contradicted
- Bring the notes back and revise the roadmap/feature plans before starting to build
