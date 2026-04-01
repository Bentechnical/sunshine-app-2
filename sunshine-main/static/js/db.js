// db.js -- Dexie database definition
const db = new Dexie('sunshine');

db.version(1).stores({
  // Synced from server -- server wins on conflict
  shifts:          'id, date, status, agency_id, synced_at',
  agencies:        'id, name, synced_at',
  dogs:            'id, volunteer_id, synced_at',
  volunteer:       'id',                        // single row, own profile
  assets:          'id, shift_id, synced_at',   // cached asset metadata

  // Client-owned -- optimistic, synced to server
  pending_actions: '++id, type, created_at, status',
  //   type: 'checkin' | 'checkout' | 'survey_submit' | 'photo_upload'
  //   status: 'pending' | 'syncing' | 'failed'

  pending_uploads: '++id, shift_id, agency_id, created_at, status',
  //   blob stored as ArrayBuffer
  //   status: 'pending' | 'syncing' | 'failed' | 'complete'
});

window.sunshineDB = db;
