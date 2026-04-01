-- Add new application status values for integrated dog registration flow

ALTER TYPE volunteer_application_status ADD VALUE IF NOT EXISTS 'dog_registration_completed';
ALTER TYPE volunteer_application_status ADD VALUE IF NOT EXISTS 'dog_registration_skipped';

COMMENT ON TYPE volunteer_application_status IS 
'Application lifecycle statuses:
- started: Initial step
- personal_info_completed: Step 1 done
- questionnaire_completed: Step 2 done  
- dog_registration_completed: Step 3 done (with dog)
- dog_registration_skipped: Step 3 skipped (no dog)
- submitted: Step 4 agreements signed
- under_review: Admin reviewing
- pending_vsc: Awaiting vulnerable sector check
- pending_background_check: Awaiting background check
- pending_assessment: Awaiting assessment
- assessment_scheduled: Assessment date set
- approved: Application approved
- rejected: Application rejected
- withdrawn: Applicant withdrew';
