import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserProfile, AttendanceRecord } from '../types';

// Default Supabase credentials provided for this project
const DEFAULT_SUPABASE_URL = 'https://tbqnpzksvazcvtzwhmnj.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ksjL0w99WZM1cgXSdk5eWg_j4P55jHJ';

// Retrieve Supabase credentials from Vite / Next environment variables or defaults
const env = (import.meta as any).env || {};
const supabaseUrl: string = 
  env.NEXT_PUBLIC_SUPABASE_URL || 
  env.VITE_SUPABASE_URL || 
  DEFAULT_SUPABASE_URL;

const supabaseAnonKey: string = 
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  env.VITE_SUPABASE_ANON_KEY || 
  env.VITE_SUPABASE_PUBLISHABLE_KEY || 
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

let clientInstance: SupabaseClient | null = null;

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    supabaseUrl && 
    supabaseAnonKey && 
    supabaseUrl.startsWith('https://') && 
    supabaseAnonKey.length > 10
  );
};

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    });
  }
  return clientInstance;
};

export const supabase = getSupabase();

// --- Field mappers between TypeScript interfaces and Supabase PostgreSQL schema ---

export const mapUserToSupabase = (user: UserProfile) => ({
  uid: user.uid,
  display_name: user.displayName,
  email: user.email.toLowerCase().trim(),
  role: user.role,
  employee_id: user.employeeId || null,
  pin: user.pin || null,
  shift_start: user.shiftStart || '09:00',
  shift_end: user.shiftEnd || '17:00',
  registered_signature: user.registeredSignature || null,
  lateness_tolerance: user.latenessTolerance ?? 15,
  password: user.password || null,
  biometrics_enabled: Boolean(user.biometricsEnabled),
  biometric_type: user.biometricType || 'face',
  face_photo: user.facePhoto || null,
  updated_at: new Date().toISOString()
});

export const mapSupabaseToUser = (row: any): UserProfile => ({
  uid: row.uid,
  displayName: row.display_name,
  email: row.email,
  role: row.role,
  employeeId: row.employee_id || undefined,
  pin: row.pin || undefined,
  shiftStart: row.shift_start || '09:00',
  shiftEnd: row.shift_end || '17:00',
  registeredSignature: row.registered_signature || undefined,
  latenessTolerance: row.lateness_tolerance ?? 15,
  password: row.password || undefined,
  biometricsEnabled: Boolean(row.biometrics_enabled),
  biometricType: row.biometric_type || 'face',
  facePhoto: row.face_photo || undefined,
  createdAt: row.created_at
});

export const mapRecordToSupabase = (record: AttendanceRecord) => ({
  id: record.id || undefined,
  user_id: record.userId,
  employee_name: record.employeeName,
  date: record.date,
  clock_in: record.clockIn,
  clock_out: record.clockOut || null,
  total_hours: record.totalHours ?? 0,
  status: record.status,
  clock_in_signature: record.clockInSignature || null,
  clock_out_signature: record.clockOutSignature || null,
  signature_match_percentage: record.signatureMatchPercentage ?? null,
  signature_match_verified: Boolean(record.signatureMatchVerified),
  signature_match_reason: record.signatureMatchReason || null,
  biometric_verified: Boolean(record.biometricVerified),
  biometric_type: record.biometricType || null,
  biometric_stamp: record.biometricStamp || null,
  clock_out_biometric_verified: Boolean(record.clockOutBiometricVerified),
  clock_out_biometric_type: record.clockOutBiometricType || null,
  clock_out_biometric_stamp: record.clockOutBiometricStamp || null,
  authorized_by: record.authorizedBy || null,
  authorized_by_name: record.authorizedByName || null,
  pin_verified: Boolean(record.pinVerified),
  verification_method: record.verificationMethod || null,
  is_visitor: Boolean(record.isVisitor),
  visitor_email: record.visitorEmail || null,
  visitor_host: record.visitorHost || null,
  visitor_purpose: record.visitorPurpose || null
});

export const mapSupabaseToRecord = (row: any): AttendanceRecord => ({
  id: row.id,
  userId: row.user_id,
  employeeName: row.employee_name,
  date: row.date,
  clockIn: row.clock_in,
  clockOut: row.clock_out || undefined,
  totalHours: row.total_hours !== null ? Number(row.total_hours) : undefined,
  status: row.status,
  clockInSignature: row.clock_in_signature || undefined,
  clockOutSignature: row.clock_out_signature || undefined,
  signatureMatchPercentage: row.signature_match_percentage !== null ? Number(row.signature_match_percentage) : undefined,
  signatureMatchVerified: row.signature_match_verified || undefined,
  signatureMatchReason: row.signature_match_reason || undefined,
  biometricVerified: row.biometric_verified || undefined,
  biometricType: row.biometric_type || undefined,
  biometricStamp: row.biometric_stamp || undefined,
  clockOutBiometricVerified: row.clock_out_biometric_verified || undefined,
  clockOutBiometricType: row.clock_out_biometric_type || undefined,
  clockOutBiometricStamp: row.clock_out_biometric_stamp || undefined,
  authorizedBy: row.authorized_by || undefined,
  authorizedByName: row.authorized_by_name || undefined,
  pinVerified: row.pin_verified || undefined,
  verificationMethod: row.verification_method || undefined,
  isVisitor: Boolean(row.is_visitor),
  visitorEmail: row.visitor_email || undefined,
  visitorHost: row.visitor_host || undefined,
  visitorPurpose: row.visitor_purpose || undefined
});
