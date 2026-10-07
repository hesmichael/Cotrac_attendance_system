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
  stage: 'idle' | 'checking_database' | 'migrating_users' | 'migrating_records' | 'migrating_activities' | 'completed' | 'failed';
  message: string;
  totalUsers: number;
  migratedUsers: number;
  totalRecords: number;
  migratedRecords: number;
  totalActivities: number;
  migratedActivities: number;
  storageBucketReady?: boolean;
  uploadedImagesCount?: number;
  error?: string;
}

export const STORAGE_BUCKET = 'cotrac-media';

// Local cache keys for offline resilience
const CACHE_KEY_USERS = 'cotrac_cached_all_users_v5';
const CACHE_KEY_RECORDS = 'cotrac_cached_records';
const SHEETS_WEBHOOK_KEY = 'cotrac_google_sheets_webhook_url';
const SHEETS_AUTO_SYNC_KEY = 'cotrac_google_sheets_auto_sync';
const SHEETS_LAST_SYNC_KEY = 'cotrac_google_sheets_last_sync';

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
// OPTION 2B: SUPABASE STORAGE BUCKET (cotrac-media) + URL REFERENCES IN POSTGRES
// -----------------------------------------------------------------------------

export const isBase64DataUrl = (val?: string | null): boolean => {
  return Boolean(val && val.startsWith('data:image/'));
};

const sanitizeStorageSegment = (raw: string): string => {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const dataUrlToBlob = (dataUrl: string): { blob: Blob; contentType: string; ext: string } => {
  const [header, base64Data] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : 'jpg';

  const byteCharacters = atob(base64Data);
  const byteNumbers = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([byteNumbers], { type: contentType });
  return { blob, contentType, ext };
};

// Track bucket availability so we never flood the network if the SQL script hasn't been run yet
let bucketStatus: 'unknown' | 'ready' | 'missing' = 'unknown';

export const checkStorageBucketReady = async (forceRecheck = false): Promise<boolean> => {
  const supabase = getSupabase();
  if (!supabase) return false;
  if (!forceRecheck && bucketStatus === 'ready') return true;
  if (!forceRecheck && bucketStatus === 'missing') return false;

  try {
    const probeBlob = new Blob(['ok'], { type: 'text/plain' });
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload('_healthcheck.txt', probeBlob, {
        contentType: 'text/plain',
        upsert: true
      });

    if (!error) {
      bucketStatus = 'ready';
      return true;
    }

    bucketStatus = 'missing';
    return false;
  } catch {
    bucketStatus = 'missing';
    return false;
  }
};

/**
 * Option 2B Core Uploader:
 * Converts a compressed Base64 data URL into a raw binary Blob, uploads it to
 * the `cotrac-media` Supabase Storage Bucket, and returns the short public URL
 * (~90 bytes) to store in PostgreSQL instead of inline Base64 text.
 */
export const uploadImageToSupabaseStorage = async (
  value: string | undefined,
  folder: 'signatures/users' | 'biometrics/users' | 'signatures/records' | 'biometrics/records',
  identifier: string
): Promise<string | undefined> => {
  if (!value) return value;
  if (!isBase64DataUrl(value)) return value;

  // If we already know the bucket hasn't been created in Supabase SQL Editor yet, skip network call
  if (bucketStatus === 'missing') return value;

  const supabase = getSupabase();
  if (!supabase) return value;

  try {
    const { blob, contentType, ext } = dataUrlToBlob(value);
    const safeId = sanitizeStorageSegment(identifier);
    const filePath = `${folder}/${safeId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, blob, {
        contentType,
        upsert: true,
        cacheControl: '3600'
      });

    if (uploadError) {
      if (
        uploadError.message?.toLowerCase().includes('bucket') ||
        uploadError.message?.toLowerCase().includes('not found') ||
        uploadError.message?.toLowerCase().includes('security')
      ) {
        bucketStatus = 'missing';
      }
      return value;
    }

    bucketStatus = 'ready';

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    if (publicUrlData?.publicUrl) {
      return `${publicUrlData.publicUrl}?t=${Date.now()}`;
    }
  } catch (err) {
    console.warn('[StorageService] Image upload fallback:', err);
  }

  return value;
};

// -----------------------------------------------------------------------------
// USER OPERATIONS (100% SUPABASE + OPTION 2B STORAGE BUCKET)
// -----------------------------------------------------------------------------

export const dbGetUser = async (uidOrEmail: string): Promise<UserProfile | null> => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: userByUid } = await supabase
        .from('users')
        .select('*')
        .eq('uid', uidOrEmail)
        .maybeSingle();

      if (userByUid) {
        return mapSupabaseToUser(userByUid);
      }

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

  const cachedUsers = getCachedUsers();
  const found = cachedUsers.find(
    u => u.uid === uidOrEmail || (u.email && u.email.toLowerCase().trim() === uidOrEmail.toLowerCase().trim())
  );
  if (found) return found;

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

export const dbSaveUser = async (user: UserProfile, skipSheetsPush = false): Promise<UserProfile> => {
  let registeredSignatureUrl = user.registeredSignature;
  let facePhotoUrl = user.facePhoto;

  if (isBase64DataUrl(registeredSignatureUrl)) {
    registeredSignatureUrl = await uploadImageToSupabaseStorage(
      registeredSignatureUrl,
      'signatures/users',
      `${user.uid}_sig`
    );
  }

  if (isBase64DataUrl(facePhotoUrl)) {
    facePhotoUrl = await uploadImageToSupabaseStorage(
      facePhotoUrl,
      'biometrics/users',
      `${user.uid}_face`
    );
  }

  const optimizedUser: UserProfile = {
    ...user,
    registeredSignature: registeredSignatureUrl,
    facePhoto: facePhotoUrl
  };

  const cached = getCachedUsers();
  const updatedCache = [optimizedUser, ...cached.filter(u => u.uid !== optimizedUser.uid && u.email?.toLowerCase() !== optimizedUser.email?.toLowerCase())];
  setCachedUsers(updatedCache);

  const supabase = getSupabase();
  if (supabase) {
    try {
      const mapped = mapUserToSupabase(optimizedUser);
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

  if (!skipSheetsPush && getGoogleSheetsWebhookUrl() && getGoogleSheetsAutoSync()) {
    pushEventToGoogleSheets('upsert_user', { user: optimizedUser }).catch(() => {});
  }

  return optimizedUser;
};

export const dbDeleteUser = async (uid: string, email?: string): Promise<void> => {
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
// ATTENDANCE & VISITOR RECORDS OPERATIONS (100% SUPABASE + OPTION 2B STORAGE)
// -----------------------------------------------------------------------------

export const dbGetAllRecords = async (): Promise<AttendanceRecord[]> => {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('attendance_records')
        .select('*')
        .order('clock_in', { ascending: false })
        .limit(250);

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

export const dbSaveRecord = async (record: AttendanceRecord, skipSheetsPush = false): Promise<string> => {
  let createdId = record.id || `rec-${Date.now()}`;

  const [clockInSigUrl, clockOutSigUrl, bioStampUrl, clockOutBioStampUrl] = await Promise.all([
    isBase64DataUrl(record.clockInSignature)
      ? uploadImageToSupabaseStorage(record.clockInSignature, 'signatures/records', `${createdId}_in_sig`)
      : Promise.resolve(record.clockInSignature),
    isBase64DataUrl(record.clockOutSignature)
      ? uploadImageToSupabaseStorage(record.clockOutSignature, 'signatures/records', `${createdId}_out_sig`)
      : Promise.resolve(record.clockOutSignature),
    isBase64DataUrl(record.biometricStamp)
      ? uploadImageToSupabaseStorage(record.biometricStamp, 'biometrics/records', `${createdId}_in_bio`)
      : Promise.resolve(record.biometricStamp),
    isBase64DataUrl(record.clockOutBiometricStamp)
      ? uploadImageToSupabaseStorage(record.clockOutBiometricStamp, 'biometrics/records', `${createdId}_out_bio`)
      : Promise.resolve(record.clockOutBiometricStamp)
  ]);

  const recordWithId: AttendanceRecord = {
    ...record,
    id: createdId,
    clockInSignature: clockInSigUrl,
    clockOutSignature: clockOutSigUrl,
    biometricStamp: bioStampUrl,
    clockOutBiometricStamp: clockOutBioStampUrl
  };

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

  if (!skipSheetsPush && getGoogleSheetsWebhookUrl() && getGoogleSheetsAutoSync()) {
    pushEventToGoogleSheets('upsert_record', { record: recordWithId }).catch(() => {});
  }

  return createdId;
};

export const dbDeleteRecord = async (id: string): Promise<void> => {
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
// SUPABASE DATABASE & STORAGE BUCKET (OPTION 2B) HEALTH & OPTIMIZATION
// -----------------------------------------------------------------------------

export const verifySupabaseDatabase = async (
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ success: boolean; stats: { users: number; records: number; activities: number; uploadedImages: number; bucketReady: boolean }; error?: string }> => {
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
    return { success: false, stats: { users: 0, records: 0, activities: 0, uploadedImages: 0, bucketReady: false }, error: errorMsg };
  }

  onProgress?.({
    stage: 'checking_database',
    message: 'Verifying Supabase PostgreSQL tables & Option 2B Storage Bucket (cotrac-media)...',
    totalUsers: 0,
    migratedUsers: 0,
    totalRecords: 0,
    migratedRecords: 0,
    totalActivities: 0,
    migratedActivities: 0
  });

  try {
    // 1. Fast head count queries (transfers 0 bytes of Base64 data, completes in <50ms)
    const [usersCountRes, recordsCountRes, activitiesCountRes, bucketReady] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('attendance_records').select('*', { count: 'exact', head: true }),
      supabase.from('activities').select('*', { count: 'exact', head: true }),
      checkStorageBucketReady(true)
    ]);

    if (usersCountRes.error) throw new Error(`Users table error: ${usersCountRes.error.message}`);
    if (recordsCountRes.error) throw new Error(`Attendance records table error: ${recordsCountRes.error.message}`);

    const totalUsers = usersCountRes.count || 0;
    const totalRecords = recordsCountRes.count || 0;
    const totalActivities = activitiesCountRes.count || 0;
    let uploadedImages = 0;

    // 2. Only attempt Base64 -> Storage Bucket migration if the `cotrac-media` bucket is ready
    if (bucketReady) {
      onProgress?.({
        stage: 'migrating_users',
        message: `Optimizing ${totalUsers} personnel profiles into cotrac-media Storage Bucket...`,
        totalUsers,
        migratedUsers: 0,
        totalRecords,
        migratedRecords: 0,
        totalActivities,
        migratedActivities: 0,
        storageBucketReady: true
      });

      const { data: usersRows } = await supabase.from('users').select('*');
      const users = (usersRows || []).map(mapSupabaseToUser);

      for (let i = 0; i < users.length; i++) {
        const u = users[i];
        const needsSig = isBase64DataUrl(u.registeredSignature);
        const needsFace = isBase64DataUrl(u.facePhoto);

        if (needsSig || needsFace) {
          const updatedUser = await dbSaveUser(u, true);
          if (needsSig && !isBase64DataUrl(updatedUser.registeredSignature)) uploadedImages++;
          if (needsFace && !isBase64DataUrl(updatedUser.facePhoto)) uploadedImages++;
        }
      }

      // Process attendance records in small safe batches of 15 to prevent large payload timeouts
      const batchSize = 15;
      for (let offset = 0; offset < totalRecords; offset += batchSize) {
        onProgress?.({
          stage: 'migrating_records',
          message: `Optimizing attendance records (${Math.min(offset + batchSize, totalRecords)}/${totalRecords}) into cotrac-media Storage...`,
          totalUsers,
          migratedUsers: totalUsers,
          totalRecords,
          migratedRecords: offset,
          totalActivities,
          migratedActivities: 0,
          storageBucketReady: true,
          uploadedImagesCount: uploadedImages
        });

        const { data: batchRows } = await supabase
          .from('attendance_records')
          .select('*')
          .order('clock_in', { ascending: false })
          .range(offset, offset + batchSize - 1);

        const batchRecords = (batchRows || []).map(mapSupabaseToRecord);
        for (const r of batchRecords) {
          const inlineCount = [
            r.clockInSignature,
            r.clockOutSignature,
            r.biometricStamp,
            r.clockOutBiometricStamp
          ].filter(isBase64DataUrl).length;

          if (inlineCount > 0) {
            await dbSaveRecord(r, true);
            uploadedImages += inlineCount;
          }
        }
      }
    }

    const stats = {
      users: totalUsers,
      records: totalRecords,
      activities: totalActivities,
      uploadedImages,
      bucketReady
    };

    const statusMsg = bucketReady
      ? `Supabase & Option 2B Storage (cotrac-media) active! Users: ${stats.users}, Records: ${stats.records}${uploadedImages > 0 ? `, Offloaded ${uploadedImages} image(s) to Storage URLs.` : ' (All images optimized).'}`
      : `Supabase Database active (Users: ${stats.users}, Records: ${stats.records}). To activate Option 2B Storage Bucket (cotrac-media), click "Copy SQL Script" in Step 1 and run it in your Supabase SQL Editor.`;

    onProgress?.({
      stage: 'completed',
      message: statusMsg,
      totalUsers: stats.users,
      migratedUsers: stats.users,
      totalRecords: stats.records,
      migratedRecords: stats.records,
      totalActivities: stats.activities,
      migratedActivities: stats.activities,
      storageBucketReady: bucketReady,
      uploadedImagesCount: uploadedImages
    });

    return { success: true, stats };
  } catch (err: any) {
    const rawMsg = err?.message || 'Failed connecting to Supabase.';
    const errorMsg = rawMsg.includes('Failed to fetch')
      ? 'Network request interrupted while communicating with Supabase. Please check your connection and try again.'
      : rawMsg;

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
    return { success: false, stats: { users: 0, records: 0, activities: 0, uploadedImages: 0, bucketReady: false }, error: errorMsg };
  }
};

// -----------------------------------------------------------------------------
// DIRECT SUPABASE <-> GOOGLE SHEETS SYNC (ZERO FIREBASE)
// -----------------------------------------------------------------------------

export const getGoogleSheetsWebhookUrl = (): string => {
  try {
    return localStorage.getItem(SHEETS_WEBHOOK_KEY) || '';
  } catch {
    return '';
  }
};

export const setGoogleSheetsWebhookUrl = (url: string): void => {
  try {
    const clean = url.trim();
    if (clean) {
      localStorage.setItem(SHEETS_WEBHOOK_KEY, clean);
    } else {
      localStorage.removeItem(SHEETS_WEBHOOK_KEY);
    }
  } catch {}
};

export const getGoogleSheetsAutoSync = (): boolean => {
  try {
    const val = localStorage.getItem(SHEETS_AUTO_SYNC_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
};

export const setGoogleSheetsAutoSync = (enabled: boolean): void => {
  try {
    localStorage.setItem(SHEETS_AUTO_SYNC_KEY, enabled ? 'true' : 'false');
  } catch {}
};

export const getGoogleSheetsLastSync = (): string | null => {
  try {
    return localStorage.getItem(SHEETS_LAST_SYNC_KEY);
  } catch {
    return null;
  }
};

const setGoogleSheetsLastSync = (isoTimestamp: string): void => {
  try {
    localStorage.setItem(SHEETS_LAST_SYNC_KEY, isoTimestamp);
  } catch {}
};

/**
 * Triggers the Google Apps Script Web App to pull fresh data directly from Supabase.
 * Uses a multi-transport trigger (lightweight GET fetch + Image beacon fallback) so
 * Google's 302 redirect on `script.google.com` never throws "Failed to fetch" in browsers/iframes.
 */
const triggerGoogleAppsScriptSync = async (webhookUrl: string): Promise<void> => {
  const separator = webhookUrl.includes('?') ? '&' : '?';
  const syncUrl = `${webhookUrl}${separator}action=sync&t=${Date.now()}`;

  try {
    await fetch(syncUrl, {
      method: 'GET',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store'
    });
  } catch {
    // Fallback for strict iframe/browser environments that block cross-origin 302 redirects in fetch()
    await new Promise<void>((resolve) => {
      try {
        const img = new Image();
        const timer = setTimeout(() => resolve(), 2500);
        img.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        img.onerror = () => {
          // Even when Apps Script returns JSON (causing image decode error), the HTTP GET executed the script!
          clearTimeout(timer);
          resolve();
        };
        img.src = syncUrl;
      } catch {
        resolve();
      }
    });
  }
};

export const pushEventToGoogleSheets = async (
  _action: 'upsert_record' | 'upsert_user',
  _data: { record?: AttendanceRecord; user?: UserProfile }
): Promise<boolean> => {
  const webhookUrl = getGoogleSheetsWebhookUrl();
  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) return false;

  try {
    await triggerGoogleAppsScriptSync(webhookUrl);
    setGoogleSheetsLastSync(new Date().toISOString());
    return true;
  } catch {
    return false;
  }
};

/**
 * Full 1-Click Sync from Supabase PostgreSQL to Google Sheets:
 * Because the Google Apps Script is connected directly to Supabase's REST API,
 * triggering the Web App causes Google Sheets to pull all latest `attendance_records`
 * and `users` directly from Supabase on Google's servers (zero browser CORS / payload limits).
 */
export const syncSupabaseToGoogleSheets = async (
  customRecords?: AttendanceRecord[]
): Promise<{ success: boolean; syncedRecords: number; syncedUsers: number; message: string }> => {
  const webhookUrl = getGoogleSheetsWebhookUrl().trim();

  if (!webhookUrl) {
    return {
      success: false,
      syncedRecords: 0,
      syncedUsers: 0,
      message: 'Please paste your deployed Google Apps Script Web App URL (ending in /exec), or run "⚡ COTRAC Supabase → Pull Latest Data Directly from Supabase" inside your Google Sheet.'
    };
  }

  if (webhookUrl.includes('docs.google.com/spreadsheets')) {
    return {
      success: false,
      syncedRecords: 0,
      syncedUsers: 0,
      message: 'You pasted the Google Spreadsheet URL instead of the Apps Script Web App URL. In your Sheet, open Extensions → Apps Script → Deploy → New deployment → Web app (Who has access: Anyone), and paste the https://script.google.com/macros/s/.../exec URL.'
    };
  }

  if (!webhookUrl.startsWith('https://script.google.com/')) {
    return {
      success: false,
      syncedRecords: 0,
      syncedUsers: 0,
      message: 'Invalid URL format. Please provide a Google Apps Script Web App URL starting with https://script.google.com/macros/s/...'
    };
  }

  try {
    const supabase = getSupabase();
    let recordsCount = customRecords ? customRecords.length : getCachedRecords().length;
    let usersCount = getCachedUsers().length;

    if (supabase) {
      const [uRes, rRes] = await Promise.all([
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('attendance_records').select('*', { count: 'exact', head: true })
      ]);
      if (uRes.count !== null) usersCount = uRes.count;
      if (rRes.count !== null) recordsCount = rRes.count;
    }

    await triggerGoogleAppsScriptSync(webhookUrl);

    const nowIso = new Date().toISOString();
    setGoogleSheetsLastSync(nowIso);

    return {
      success: true,
      syncedRecords: recordsCount,
      syncedUsers: usersCount,
      message: `Triggered direct Supabase → Google Sheets sync (${recordsCount} attendance records & ${usersCount} personnel profiles).`
    };
  } catch (err: any) {
    return {
      success: false,
      syncedRecords: 0,
      syncedUsers: 0,
      message: 'Could not reach Google Sheets Web App. Ensure your Apps Script deployment has "Who has access" set to "Anyone".'
    };
  }
};

/**
 * Generates a self-contained Google Apps Script that connects Google Sheets
 * DIRECTLY to Supabase PostgreSQL (REST API + Real-Time Webhook Trigger) with zero Firebase.
 */
export const getSupabaseGoogleAppsScript = (): string => {
  return `// ============================================================================
// COTRAC DIRECT SUPABASE <-> GOOGLE SHEETS CONNECTOR (ZERO FIREBASE)
// Connects your Google Sheet directly to Supabase PostgreSQL & Storage (Option 2B)
//
// SETUP INSTRUCTIONS (Takes 60 seconds):
// 1. Open your Google Sheet -> Click "Extensions" -> "Apps Script"
// 2. Replace any code in Code.gs with this entire script and click Save (💾)
// 3. Click "Run" at the top (with "pullDirectlyFromSupabase" selected) and
//    click "Review permissions" -> "Allow" so your Sheet can connect to Supabase.
// 4. For 1-Click & Real-Time Auto-Sync from the COTRAC Web App:
//    Click "Deploy" -> "New deployment" -> Select type: "Web app"
//    Set "Execute as": "Me" and "Who has access": "Anyone" -> Click "Deploy"
//    Copy the Web App URL (ending in /exec) and paste it into COTRAC!
// ============================================================================

const SUPABASE_URL = 'https://tbqnpzksvazcvtzwhmnj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ksjL0w99WZM1cgXSdk5eWg_j4P55jHJ';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ COTRAC Supabase')
    .addItem('🔄 Pull Latest Data Directly from Supabase', 'pullDirectlyFromSupabase')
    .addItem('⏱️ Enable Automatic 15-Minute Supabase Sync', 'enableAutoTrigger')
    .addToUi();
}

// Handles GET triggers from COTRAC Web App ("Sync Supabase to Sheet" & real-time events)
function doGet(e) {
  try {
    pullDirectlyFromSupabase();
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', syncedAt: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Handles POST triggers if called via webhook
function doPost(e) {
  try {
    pullDirectlyFromSupabase();
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', syncedAt: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// DIRECT SUPABASE POSTGRESQL PULL (Sheet <-> Supabase REST API)
function pullDirectlyFromSupabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY
  };

  // 1. Fetch Attendance Records directly from Supabase
  const recRes = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/attendance_records?select=*&order=clock_in.desc',
    { method: 'get', headers: headers, muteHttpExceptions: true }
  );
  const records = JSON.parse(recRes.getContentText() || '[]');

  // 2. Fetch Users directly from Supabase
  const usrRes = UrlFetchApp.fetch(
    SUPABASE_URL + '/rest/v1/users?select=*&order=display_name.asc',
    { method: 'get', headers: headers, muteHttpExceptions: true }
  );
  const users = JSON.parse(usrRes.getContentText() || '[]');

  writeRecordsSheet(ss, records, users);
  writeUsersSheet(ss, users);
}

function writeRecordsSheet(ss, records, users) {
  let sheet = ss.getSheetByName('Attendance_Records');
  if (!sheet) sheet = ss.insertSheet('Attendance_Records');
  sheet.clearContents();

  const headerRow = [
    'Record ID', 'Date', 'Personnel / Visitor Name', 'Category', 'Employee ID / Host',
    'Email', 'Clock In', 'Clock Out', 'Total Hours', 'Status',
    'Verification Method', 'Authorized By', 'Signature URL (Supabase Storage)', 'Biometric URL (Supabase Storage)'
  ];
  const rows = [headerRow];

  const userMap = {};
  (users || []).forEach(function(u) { userMap[u.uid] = u; });

  (records || []).forEach(function(r) {
    const staff = userMap[r.user_id] || {};
    const isVisitor = Boolean(r.is_visitor);
    const sigUrl = (r.clock_in_signature && String(r.clock_in_signature).indexOf('http') === 0) ? r.clock_in_signature : (r.clock_in_signature ? '[Signed]' : '');
    const bioUrl = (r.biometric_stamp && String(r.biometric_stamp).indexOf('http') === 0) ? r.biometric_stamp : (r.biometric_stamp ? '[Biometric]' : '');
    rows.push([
      r.id || '',
      r.date || '',
      r.employee_name || '',
      isVisitor ? 'Visitor' : 'Staff',
      isVisitor ? ('Host: ' + (r.visitor_host || 'N/A')) : (staff.employee_id || 'Staff'),
      isVisitor ? (r.visitor_email || '') : (staff.email || ''),
      r.clock_in || '',
      r.clock_out || '',
      r.total_hours || 0,
      r.status || 'Present',
      r.biometric_verified ? 'Biometric Face ID' : (r.clock_in_signature ? 'Digital Signature' : 'PIN'),
      r.authorized_by_name || 'Self',
      sigUrl,
      bioUrl
    ]);
  });

  sheet.getRange(1, 1, rows.length, headerRow.length).setValues(rows);
  sheet.getRange(1, 1, 1, headerRow.length).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

function writeUsersSheet(ss, users) {
  let sheet = ss.getSheetByName('Personnel_Directory');
  if (!sheet) sheet = ss.insertSheet('Personnel_Directory');
  sheet.clearContents();

  const headerRow = [
    'UID', 'Full Name', 'Email', 'Role', 'Employee ID',
    'Shift Start', 'Shift End', 'Biometrics Enabled',
    'Face Photo URL (Supabase Storage)', 'Signature URL (Supabase Storage)'
  ];
  const rows = [headerRow];

  (users || []).forEach(function(u) {
    const faceUrl = (u.face_photo && String(u.face_photo).indexOf('http') === 0) ? u.face_photo : (u.face_photo ? '[Enrolled]' : '');
    const sigUrl = (u.registered_signature && String(u.registered_signature).indexOf('http') === 0) ? u.registered_signature : (u.registered_signature ? '[Enrolled]' : '');
    rows.push([
      u.uid || '',
      u.display_name || '',
      u.email || '',
      u.role || 'staff',
      u.employee_id || '',
      u.shift_start || '09:00',
      u.shift_end || '17:00',
      u.biometrics_enabled ? 'Yes' : 'No',
      faceUrl,
      sigUrl
    ]);
  });

  sheet.getRange(1, 1, rows.length, headerRow.length).setValues(rows);
  sheet.getRange(1, 1, 1, headerRow.length).setFontWeight('bold').setBackground('#047857').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

function enableAutoTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'pullDirectlyFromSupabase') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('pullDirectlyFromSupabase').timeBased().everyMinutes(15).create();
  SpreadsheetApp.getUi().alert('Automatic 15-minute direct sync from Supabase enabled!');
}
`;
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
    storageArchitecture: 'Option 2B - Supabase Storage Bucket (cotrac-media) + PostgreSQL URL References',
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
