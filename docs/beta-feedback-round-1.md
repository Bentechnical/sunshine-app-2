# Beta Feedback — Round 1 (September 2026)

## Bugs

### 1. Audience categories fail to load on profile creation
Preferred populations list shows "Loading categories" and never resolves. (Amanda)

### 2. Intermittent "Failed to fetch requests" error
Occurs when navigating to Browse Group Visits. Works on retry — likely a race condition. (Amanda)

### 3. Intermittent "User not found" on first visit signup
First attempt fails, second succeeds. Another probable race condition. (Amanda)

### 4. ~~Travel distance preference not carried to browse~~ RESOLVED
Profile set to 10km, but Browse Group Visits defaults to 15km regardless of saved preference. (Desktop tester)
**Resolution:** User confusion caused by previously having separate travel distance fields for individual and group visits. Already addressed — individual visit travel distance removed from front-end in a recent hotfix.

### 5. Browse Group Visits shows no results
Even at 250km radius, no visits displayed. Could be an approval/compliance gating issue rather than a bug — needs clarification with tester. (Desktop tester)

---

## Compliance Document Flow (Process Redesign)

### 6. Profile approval and doc approval are disconnected
Admin approves profile but doesn't simultaneously review uploaded compliance docs. When docs are submitted at signup, the approval flow should surface them together so they aren't missed.

### 7. No notification when compliance docs are uploaded later
Admins/PDs have no alert or flag when a volunteer uploads docs after initial profile creation. Relies entirely on proactive checking — won't scale.

### 8. No transactional email when compliance docs are approved
Volunteer gets "you're approved!" (profile) but is still blocked waiting on doc approval. Then when docs are approved, no notification is sent. Creates confusion about actual status. Needs a clearer email sequence that distinguishes profile approval from full compliance approval.

### 9. Password-protected PDF uploads
A tester uploaded a real VSC as a password-protected PDF. This is likely common given the sensitive nature of the document. Need a workaround — detect and flag protected PDFs at upload time, prompt for unprotected version or image/scan alternative.

---

## Visit Lifecycle (Process Design Needed)

### 10. No clear visit completion/archival model
Currently admin can mark a visit as complete, but the broader lifecycle is undefined: Are visits auto-completed after they pass? Can visits be deleted if created by accident? What's the archive vs. delete distinction? Needs a designed flow for the full visit lifecycle (upcoming → completed → archived/deleted).

### 11. Visit deletion/cancellation not synced with Google Calendar
If a visit is deleted or archived in the app, the corresponding Google Calendar event should be removed. This linkage doesn't exist yet.

---

## Feature Requests

### 12. Linked org visit history
Admin should be able to click through to an org and see all past visits (who signed up, notes, etc.). Primarily an admin tool, but could later be exposed to volunteers. Major feature but potentially straightforward since the data already exists.

### 13. Day-of-week and date range filters for browsing visits
E.g., "show me all Friday visits" or "visits between Oct 1–15." (Amanda)

### 14. Visit completion tracking for volunteers
"You've completed 3 of 24 visits this year." Useful for volunteer engagement and reporting. Depends on visit lifecycle (#10) being solved first. (Desktop tester)

---

## UX Improvements

### 15. ~~Add portal link to approval email~~ ALREADY EXISTS
The approval email already includes a "Go to Dashboard" button with a link to the app. Amanda likely meant the welcome email (sent on signup), but that email is intentionally lightweight since the user can't access the app until approved anyway. No change needed.

### 16. ~~Larger/highlighted "Sign Up as New User" on login page~~ DONE
New users may miss the signup option. Increase visibility. (Desktop tester — quick win)
**Status:** Already addressed.

### 17. Default mobile landing to My Visits instead of Profile
Profile is a one-time setup; My Visits is the daily-use view. Consider conditional logic: default to Profile if incomplete, My Visits otherwise. (Desktop tester)

### 18. Compliance enforcement messaging for volunteers
Clear messaging that volunteers must keep docs current or they'll lose access to visits. Ties into compliance flow redesign (#6–8). (Desktop tester)

### 19. Auto-logout after inactivity
Security suggestion — automatic session timeout after idle period. Low priority; Clerk already handles session management with configurable token expiry. (Desktop tester)

---

## Priority Summary

| Priority | Items |
|----------|-------|
| Quick wins (now) | #15, ~~#16 (done)~~, bug fixes #1–3, ~~#4 (resolved)~~ |
| Investigate | #5 (may not be a bug) |
| Design then build soon | #6–8 (compliance flow), #9 (PDF detection) |
| Design for later | #10–11 (visit lifecycle), #17 (conditional landing page) |
| Backlog | #12, #13, #14, #18, #19 |
