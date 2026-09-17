import { 
  getSupabase, 
  isSupabaseConfigured, 
  mapUserToSupabase, 
  mapSupabaseToUser, 
  mapRecordToSupabase, 
  mapSupabaseToRecord 
} from '../lib/supabase';
import { UserProfile, AttendanceRecord } from '../types';

export interface MigrationProgress {
  stage: 'idle' | 'checking_connection' | 'migrating_users' | 'migrating_records' | 'migrating_activities' | 'completed' | 'failed';
  message: string;
  totalUsers: number;
  migratedUsers: number;
  totalRecords: number;
  migratedRecords: number;
  totalActivities: number;
  migratedActivities: number;
  error?: string;
}

// Local cache keys for offline resilience
const CACHE_KEY_USERS = 'cotrac_cached_all_users_v5';
const CACHE_KEY_RECORDS = 'cotrac_cached_records';

const getCachedUsers = (): UserProfile[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY_USERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const setCachedUsers = (users: UserProfile[]) => {
  try {
    localStorage.setItem(CACHE_KEY_USERS, JSON.stringify(users));
  } catch {}
};

const getCachedRecords = (): AttendanceRecord[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY_RECORDS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const setCachedRecords = (records: AttendanceRecord[]) => {
  try {
    localStorage.setItem(CACHE_KEY_RECORDS, JSON.stringify(records));
  } catch {}
};

// -----------------------------------------------------------------------------
// USER OPERATIONS (100% SUPABASE)
// -----------------------------------------------------------------------------

export const dbGetUser = async (uidOrEmail: string): Promise<UserProfile | null> => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      // 1. Look up by UID
      const { data: userByUid } = await supabase
        .from('users')
        .select('*')
        .eq('uid', uidOrEmail)
        .maybeSingle();

      if (userByUid) {
        return mapSupabaseToUser(userByUid);
      }

      // 2. Look up by lowercase email
      if (uidOrEmail.includes('@')) {
        const { data: userByEmail } = await supabase
          .from('users')
          .select('*')
          .eq('email', uidOrEmail.toLowerCase().trim())
          .maybeSingle();

        if (userByEmail) {
          return mapSupabaseToUser(userByEmail);
        }
      }
    } catch (err) {
      console.warn('[DatabaseService] Supabase getUser error, checking local cache:', err);
    }
  }

  // Local storage offline lookup
  const cachedUsers = getCachedUsers();
  const found = cachedUsers.find(
    u => u.uid === uidOrEmail || (u.email && u.email.toLowerCase().trim() === uidOrEmail.toLowerCase().trim())
  );
  if (found) return found;

  // Check active custom user in localStorage
  try {
    const sessionUser = localStorage.getItem('cotrac_custom_user');
    if (sessionUser) {
      const parsed: UserProfile = JSON.parse(sessionUser);
      if (parsed.uid === uidOrEmail || (parsed.email && parsed.email.toLowerCase().trim() === uidOrEmail.toLowerCase().trim())) {
        return parsed;
      }
    }
  } catch {}

  return null;
};

export const dbGetAllUsers = async (): Promise<UserProfile[]> => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('display_name', { ascending: true });

      if (error) throw error;
      if (data) {
        const users = data.map(mapSupabaseToUser);
        setCachedUsers(users);
        return users;
      }
    } catch (err) {
      console.warn('[DatabaseService] Supabase getAllUsers error, using local cache:', err);
    }
  }

  return getCachedUsers();
};

export const dbSaveUser = async (user: UserProfile): Promise<void> => {
  // Update local cache immediately
  const cached = getCachedUsers();
  const updatedCache = [user, ...cached.filter(u => u.uid !== user.uid && u.email?.toLowerCase() !== user.email?.toLowerCase())];
  setCachedUsers(updatedCache);

  const supabase = getSupabase();
  if (supabase) {
    try {
      const mapped = mapUserToSupabase(user);
      const { error } = await supabase
        .from('users')
        .upsert(mapped, { onConflict: 'uid' });

      if (error) {
        console.error('[DatabaseService] Supabase saveUser error:', error);
      }
    } catch (err) {
      console.error('[DatabaseService] Supabase saveUser failed:', err);
    }
  }
};

export const dbDeleteUser = async (uid: string, email?: string): Promise<void> => {
  // Update local cache
  const cached = getCachedUsers();
  setCachedUsers(cached.filter(u => u.uid !== uid && (!email || u.email?.toLowerCase() !== email.toLowerCase())));

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('users').delete().eq('uid', uid);
      if (email) {
        await supabase.from('users').delete().eq('email', email.toLowerCase().trim());
      }
    } catch (err) {
      console.error('[DatabaseService] Supabase deleteUser error:', err);
    }
  }
};

// -----------------------------------------------------------------------------
// ATTENDANCE & VISITOR RECORDS OPERATIONS (100% SUPABASE)
// -----------------------------------------------------------------------------

export const dbGetAllRecords = async (): Promise<AttendanceRecord[]> => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .order('clock_in', { ascending: false });

      if (error) throw error;
      if (data) {
        const records = data.map(mapSupabaseToRecord);
        setCachedRecords(records);
        return records;
      }
    } catch (err) {
      console.warn('[DatabaseService] Supabase getAllRecords error, using local cache:', err);
    }
  }

  return getCachedRecords();
};

export const dbSaveRecord = async (record: AttendanceRecord): Promise<string> => {
  let createdId = record.id || `rec-${Date.now()}`;
  const recordWithId: AttendanceRecord = { ...record, id: createdId };

  // Update local cache immediately
  const cached = getCachedRecords();
  const updatedCache = [recordWithId, ...cached.filter(r => r.id !== createdId)];
  setCachedRecords(updatedCache);

  const supabase = getSupabase();
  if (supabase) {
    try {
      const mapped = mapRecordToSupabase(recordWithId);
      if (mapped.id) {
        const { error } = await supabase
          .from('attendance_records')
          .upsert(mapped, { onConflict: 'id' });
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('attendance_records')
          .insert([mapped])
          .select('id')
          .single();
        if (error) throw error;
        if (data?.id) createdId = data.id;
      }
    } catch (err) {
      console.error('[DatabaseService] Supabase saveRecord failed:', err);
    }
  }

  return createdId;
};

export const dbDeleteRecord = async (id: string): Promise<void> => {
  // Update local cache
  const cached = getCachedRecords();
  setCachedRecords(cached.filter(r => r.id !== id));

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('attendance_records').delete().eq('id', id);
    } catch (err) {
      console.error('[DatabaseService] Supabase deleteRecord error:', err);
    }
  }
};

// -----------------------------------------------------------------------------
// OPERATIONAL ACTIVITIES (AUDIT LOGS - 100% SUPABASE)
// -----------------------------------------------------------------------------

export const dbLogActivity = async (action: string, details: string, user?: UserProfile | null): Promise<void> => {
  const activityData = {
    user_id: user?.uid || 'system',
    user_name: user?.displayName || 'System Automated',
    action,
    details,
    timestamp: new Date().toISOString()
  };

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('activities').insert([activityData]);
    } catch (err) {
      console.warn('[DatabaseService] Supabase logActivity error:', err);
    }
  }
};

// -----------------------------------------------------------------------------
// SUPABASE DATABASE HEALTH & SYNC CHECK
// -----------------------------------------------------------------------------

export const verifySupabaseConnection = async (
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ success: boolean; stats: { users: number; records: number; activities: number }; error?: string }> => {
  const supabase = getSupabase();
  if (!supabase) {
    const errorMsg = 'Supabase is not configured. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.';
    onProgress?.({
      stage: 'failed',
      message: errorMsg,
      totalUsers: 0,
      migratedUsers: 0,
      totalRecords: 0,
      migratedRecords: 0,
      totalActivities: 0,
      migratedActivities: 0,
      error: errorMsg
    });
    return { success: false, stats: { users: 0, records: 0, activities: 0 }, error: errorMsg };
  }

  onProgress?.({
    stage: 'checking_connection',
    message: 'Verifying Supabase database connection and tables...',
    totalUsers: 0,
    migratedUsers: 0,
    totalRecords: 0,
    migratedRecords: 0,
    totalActivities: 0,
    migratedActivities: 0
  });

  try {
    // 1. Fetch user count
    const { count: usersCount, error: usersErr } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (usersErr) throw new Error(`Users table error: ${usersErr.message}`);

    // 2. Fetch records count
    const { count: recordsCount, error: recordsErr } = await supabase
      .from('attendance_records')
      .select('*', { count: 'exact', head: true });

    if (recordsErr) throw new Error(`Attendance records table error: ${recordsErr.message}`);

    // 3. Fetch activities count
    const { count: activitiesCount } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true });

    const stats = {
      users: usersCount || 0,
      records: recordsCount || 0,
      activities: activitiesCount || 0
    };

    onProgress?.({
      stage: 'completed',
      message: `Supabase database active & verified! Users: ${stats.users}, Records: ${stats.records}.`,
      totalUsers: stats.users,
      migratedUsers: stats.users,
      totalRecords: stats.records,
      migratedRecords: stats.records,
      totalActivities: stats.activities,
      migratedActivities: stats.activities
    });

    return { success: true, stats };
  } catch (err: any) {
    const errorMsg = err?.message || 'Failed connecting to Supabase.';
    onProgress?.({
      stage: 'failed',
      message: errorMsg,
      totalUsers: 0,
      migratedUsers: 0,
      totalRecords: 0,
      migratedRecords: 0,
      totalActivities: 0,
      migratedActivities: 0,
      error: errorMsg
    });
    return { success: false, stats: { users: 0, records: 0, activities: 0 }, error: errorMsg };
  }
};

// -----------------------------------------------------------------------------
// EXPORT ALL DATA TO JSON FILE (BACKUP UTILITY)
// -----------------------------------------------------------------------------

export const exportAllDataAsJson = async (): Promise<void> => {
  const users = await dbGetAllUsers();
  const records = await dbGetAllRecords();

  const exportData = {
    exportedAt: new Date().toISOString(),
    databaseSource: 'Supabase PostgreSQL (tbqnpzksvazcvtzwhmnj)',
    statistics: {
      totalUsers: users.length,
      totalRecords: records.length
    },
    users,
    records
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cotrac_database_export_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
