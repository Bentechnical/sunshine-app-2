// sync.js -- Logic for syncing IndexedDB with the server

async function syncSunshine() {
  const db = window.sunshineDB;
  const lastSync = localStorage.getItem('sunshine_last_synced_at');
  
  console.log('[Sync] Starting sync...', lastSync ? `Last synced: ${new Date(parseInt(lastSync) * 1000).toLocaleString()}` : 'First sync');

  try {
    const url = lastSync ? `/api/v1/volunteer/sync?since=${lastSync}` : '/api/v1/volunteer/sync';
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 401) {
        console.warn('[Sync] User not authenticated, skipping sync');
        return;
      }
      throw new Error(`Sync failed with status ${response.status}`);
    }

    const data = await response.json();
    console.log('[Sync] Received data:', data);

    // Update Dexie in a transaction
    await db.transaction('rw', [db.volunteer, db.shifts, db.agencies, db.dogs, db.assets], async () => {
      // 1. Update volunteer profile
      if (data.volunteer) {
        await db.volunteer.put(data.volunteer);
      }

      // 2. Update shifts
      if (data.shifts && data.shifts.length > 0) {
        // For full sync, we might want to clear or handle deletions, but for now we just put
        for (const shift of data.shifts) {
          await db.shifts.put({
            ...shift,
            date: shift.start_at.split('T')[0], // For easier indexing
            synced_at: data.server_time
          });
        }
      }

      // 3. Update agencies
      if (data.agencies && data.agencies.length > 0) {
        for (const agency of data.agencies) {
          await db.agencies.put({
            ...agency,
            synced_at: data.server_time
          });
        }
      }

      // 4. Update dogs
      if (data.dogs && data.dogs.length > 0) {
        for (const dog of data.dogs) {
          await db.dogs.put({
            ...dog,
            synced_at: data.server_time
          });
        }
      }

      // 5. Update assets
      if (data.assets && data.assets.length > 0) {
        for (const asset of data.assets) {
          await db.assets.put({
            ...asset,
            synced_at: data.server_time
          });
        }
      }
    });

    localStorage.setItem('sunshine_last_synced_at', data.server_time);
    console.log('[Sync] Sync complete. New server time:', data.server_time);
    
    // Notify UI that sync is done
    window.dispatchEvent(new CustomEvent('sunshine-synced'));

  } catch (err) {
    console.error('[Sync] Sync failed:', err);
  }
}

// Automatically sync on page load if online
if (navigator.onLine) {
  // Wait a bit to not block initial render
  setTimeout(syncSunshine, 1000);
}

// Also sync when coming back online
window.addEventListener('online', syncSunshine);

window.syncSunshine = syncSunshine;
