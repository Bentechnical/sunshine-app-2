// src/types/navigation.ts
export type ActiveTab =
  | 'profile'
  | 'meet-with-dog'
  | 'my-visits'
  | 'messaging'
  | 'my-therapy-dog'
  | 'connect-with-people' // volunteer: browse individuals (replaces manage-availability)
  | 'dashboard-home'
  | 'manage-users' // admin
  | 'user-requests' // admin
  | 'appointments' // admin
  | 'chats' // admin
  | 'email-testing' // admin
  | 'welcome-messages' // admin
  | 'system-logs' // admin
  | 'admin-visits' // admin + pd: organization visits management
  | 'admin-compliance' // admin + pd: volunteer VSC/vaccine compliance
  // PD tabs
  | 'pd-dashboard-home'
  | 'pd-visits'
  | 'pd-volunteers'
  | 'pd-organizations'
  | 'pd-compliance'
  // Organization tabs
  | 'org-dashboard-home'
  | 'org-request-visit'
  | 'org-my-visits';
