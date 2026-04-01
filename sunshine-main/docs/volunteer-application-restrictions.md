# Volunteer Application Restrictions

This document describes the implementation of access restrictions for volunteers with incomplete applications.

## Overview

Volunteers who have started but not completed their application process are restricted from accessing full volunteer functionality. They can only:
- View their application status
- Access messages from the admin team
- Complete their application steps

## Implementation

### 1. Request Guards (`src/auth/volunteer_status.rs`)

Three request guards provide different levels of access control:

#### `ApprovedVolunteer`
- Only allows access if the volunteer has NO active (incomplete) application
- Used for: shifts, dogs, gallery, agenda
- Returns 403 Forbidden if user has incomplete application

#### `ApplicantVolunteer`
- Only allows access if the volunteer HAS an active application
- Used for: application-specific pages
- Returns 403 Forbidden if user has no active application

#### `VolunteerWithStatus`
- Provides both user and application status info
- Used when UI needs to adapt based on status
- Does not block access, just provides info

### 2. Route Protection

Routes updated to use `ApprovedVolunteer`:
- `GET /volunteer/shifts` - Shift listing
- `GET /volunteer/shifts/<id>` - Shift detail
- `GET /volunteer/agenda` - Volunteer agenda
- `GET /volunteer/gallery` - Photo gallery
- `GET /volunteer/dashboard` - Volunteer dashboard

Routes that remain accessible to all volunteers:
- `GET /volunteer/messages` - Message center
- `GET /apply/*` - Application process
- `POST /auth/logout` - Logout

### 3. Navbar Changes (`templates/base.html.tera`)

Conditional navigation based on `volunteer_application_status`:

**With Incomplete Application:**
- "My Application" → `/apply/status`
- "Messages" → `/volunteer/messages`

**With Approved Application:**
- "Upcoming Shifts" → `/volunteer/shifts`
- "My Agenda" → `/volunteer/agenda`
- "My Dogs" → `/volunteer/dog-applications`
- "Gallery" → `/volunteer/gallery`
- "Messages" → `/volunteer/messages`

### 4. User Menu Changes

The dropdown menu also adapts:
- Incomplete applications: Links to "My Application"
- Approved volunteers: Links to "Profile"

## Template Context

Templates now receive `volunteer_application_status` when applicable:

```rust
context! {
    volunteer_application_status: &app.status,  // "started", "submitted", etc.
    user: context! { ... },
}
```

## Application Status Values

| Status | Description | Accessible Routes |
|--------|-------------|-------------------|
| `started` | Just started application | Apply only |
| `personal_info_completed` | Step 1 done | Apply only |
| `questionnaire_completed` | Step 2 done | Apply only |
| `submitted` | Application submitted | Apply + Messages |
| `under_review` | Admin reviewing | Apply + Messages |
| `pending_vsc` | Awaiting VSC | Apply + Messages |
| `pending_background_check` | Awaiting background check | Apply + Messages |
| `pending_assessment` | Awaiting assessment | Apply + Messages |
| `assessment_scheduled` | Assessment scheduled | Apply + Messages |
| `approved` | **Full access** | All volunteer routes |
| `rejected` | Application rejected | Apply (view only) |
| `withdrawn` | User withdrew | Apply (start new) |

## Database Query

The check for active applications uses this SQL:

```sql
SELECT status::text 
FROM volunteer_applications 
WHERE user_id = $1 
  AND status NOT IN ('approved', 'rejected', 'withdrawn')
ORDER BY created_at DESC
LIMIT 1
```

This efficiently finds the most recent incomplete application.

## User Experience Flow

1. User creates account → Redirected to application
2. User completes application steps → Status updates
3. User submits application → Can view status + messages
4. Admin approves application → Full access granted
5. User can now access shifts, dogs, gallery, etc.

## Testing

To test the restrictions:

1. Create a new volunteer account
2. Start but don't complete the application
3. Try to access `/volunteer/shifts` → Should get 403 or redirect
4. Complete and submit the application
5. Try to access `/volunteer/shifts` → Should still be restricted
6. Have admin approve the application
7. Try to access `/volunteer/shifts` → Should work

## Future Enhancements

1. **Custom Error Page**: Show a friendly "Complete your application" page instead of 403
2. **Progress Indicator**: Show application progress in the restricted navbar
3. **Direct Messaging**: Allow applicants to message admins directly from the status page
4. **Automated Reminders**: Email reminders to complete applications
