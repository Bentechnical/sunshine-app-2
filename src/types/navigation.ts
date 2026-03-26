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
  | 'system-logs'; // admin
