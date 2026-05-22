// src/types/navigation.ts
export type ActiveTab =
  | 'profile'
  | 'meet-with-dog'
  | 'my-visits'
  | 'messaging'
  | 'my-therapy-dog'
  | 'connect-with-people' // volunteer: browse individuals (replaces manage-availability)
  | 'dashboard-home'
  | 'group-visits' // admin + pd: group visits, manage orgs, manage PDs
  | 'manage-regions' // admin only: region management + manage PDs
  | 'manage-volunteers' // admin + pd: volunteer list with inline compliance
  | 'manage-individuals' // admin: individual user list
  | 'user-requests' // admin
  | 'appointments' // admin
  | 'chats' // admin
  | 'email-testing' // admin
  | 'welcome-messages' // admin
  | 'system-logs' // admin
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
