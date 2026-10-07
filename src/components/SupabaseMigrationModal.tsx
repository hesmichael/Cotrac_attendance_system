import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Download, 
  RefreshCw, 
  X, 
  FileSpreadsheet,
  HardDrive,
  Send
} from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';
import { 
  verifySupabaseDatabase, 
  exportAllDataAsJson, 
  MigrationProgress,
  getGoogleSheetsWebhookUrl,
  setGoogleSheetsWebhookUrl,
  getGoogleSheetsAutoSync,
  setGoogleSheetsAutoSync,
  getGoogleSheetsLastSync,
  syncSupabaseToGoogleSheets,
  getSupabaseGoogleAppsScript
} from '../services/databaseService';

interface SupabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const SupabaseMigrationModal: React.FC<SupabaseMigrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);

  // Google Sheets Direct Sync state
  const [webhookUrl, setWebhookUrl] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsStatusMsg, setSheetsStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setWebhookUrl(getGoogleSheetsWebhookUrl());
      setAutoSync(getGoogleSheetsAutoSync());
      setLastSync(getGoogleSheetsLastSync());
      setSheetsStatusMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfigured = isSupabaseConfigured();

  const handleCopySql = async () => {
    try {
      const res = await fetch('/supabase-schema.sql');
      let sqlText = '';
      if (res.ok) {
        sqlText = await res.text();
      }
      if (!sqlText || !sqlText.includes('cotrac-media')) {
        sqlText = `-- COTRAC Supabase Schema + Option 2B Storage Bucket (cotrac-media)
CREATE TABLE IF NOT EXISTS public.users (
  uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'staff',
  employee_id TEXT,
  pin TEXT,
  shift_start TEXT DEFAULT '09:00',
  shift_end TEXT DEFAULT '17:00',
  registered_signature TEXT,
  lateness_tolerance INTEGER DEFAULT 15,
  password TEXT,
  biometrics_enabled BOOLEAN DEFAULT FALSE,
  biometric_type TEXT DEFAULT 'face',
  face_photo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  date TEXT NOT NULL,
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  total_hours NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Present',
  clock_in_signature TEXT,
  clock_out_signature TEXT,
  signature_match_percentage INTEGER,
  signature_match_verified BOOLEAN,
  signature_match_reason TEXT,
  biometric_verified BOOLEAN DEFAULT FALSE,
  biometric_type TEXT,
  biometric_stamp TEXT,
  clock_out_biometric_verified BOOLEAN DEFAULT FALSE,
  clock_out_biometric_type TEXT,
  clock_out_biometric_stamp TEXT,
  authorized_by TEXT,
  authorized_by_name TEXT,
  pin_verified BOOLEAN DEFAULT FALSE,
  verification_method TEXT,
  is_visitor BOOLEAN DEFAULT FALSE,
  visitor_email TEXT,
  visitor_host TEXT,
  visitor_purpose TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activities (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read users" ON public.users;
CREATE POLICY "Allow anon read users" ON public.users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow anon upsert users" ON public.users;
CREATE POLICY "Allow anon upsert users" ON public.users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read attendance" ON public.attendance_records;
CREATE POLICY "Allow anon read attendance" ON public.attendance_records FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow anon write attendance" ON public.attendance_records;
CREATE POLICY "Allow anon write attendance" ON public.attendance_records FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read activities" ON public.activities;
CREATE POLICY "Allow anon read activities" ON public.activities FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow anon insert activities" ON public.activities;
CREATE POLICY "Allow anon insert activities" ON public.activities FOR ALL USING (true) WITH CHECK (true);

-- Option 2B: Supabase Storage Bucket (cotrac-media) & Object RLS Policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('cotrac-media', 'cotrac-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Allow public read cotrac-media" ON storage.objects;
CREATE POLICY "Allow public read cotrac-media" ON storage.objects FOR SELECT USING (bucket_id = 'cotrac-media');

DROP POLICY IF EXISTS "Allow anon upload cotrac-media" ON storage.objects;
CREATE POLICY "Allow anon upload cotrac-media" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cotrac-media');

DROP POLICY IF EXISTS "Allow anon update cotrac-media" ON storage.objects;
CREATE POLICY "Allow anon update cotrac-media" ON storage.objects FOR UPDATE USING (bucket_id = 'cotrac-media');

DROP POLICY IF EXISTS "Allow anon delete cotrac-media" ON storage.objects;
CREATE POLICY "Allow anon delete cotrac-media" ON storage.objects FOR DELETE USING (bucket_id = 'cotrac-media');
`;
      }
      await navigator.clipboard.writeText(sqlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy SQL:', e);
    }
  };

  const handleCopyAppsScript = async () => {
    try {
      const code = getSupabaseGoogleAppsScript();
      await navigator.clipboard.writeText(code);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch (e) {
      console.error('Failed to copy Apps Script:', e);
    }
  };

  const handleStartMigration = async () => {
    if (!isConfigured) {
      alert('Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Settings first.');
      return;
    }
    setIsMigrating(true);
    const result = await verifySupabaseDatabase((p) => setProgress(p));
    setIsMigrating(false);
    if (result.success) {
      if (onSuccess) onSuccess();
    }
  };

  const handleSaveSheetsConfig = () => {
    setGoogleSheetsWebhookUrl(webhookUrl);
    setGoogleSheetsAutoSync(autoSync);
    setSheetsStatusMsg({
      type: 'success',
      text: webhookUrl.trim()
        ? 'Google Sheets Web App URL saved! Real-time Supabase sync is active.'
        : 'Google Sheets Web App URL cleared.'
    });
  };

  const handleSyncSheetsNow = async () => {
    setGoogleSheetsWebhookUrl(webhookUrl);
    setGoogleSheetsAutoSync(autoSync);
    setIsSyncingSheets(true);
    setSheetsStatusMsg(null);
    const res = await syncSupabaseToGoogleSheets();
    setIsSyncingSheets(false);
    setLastSync(getGoogleSheetsLastSync());
    setSheetsStatusMsg({
      type: res.success ? 'success' : 'error',
      text: res.message
    });
  };

  const handleExportJson = async () => {
    setIsExporting(true);
    try {
      await exportAllDataAsJson();
    } catch (err) {
      console.error('Export error:', err);
      alert('Could not generate JSON export.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] my-auto"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-emerald-600 to-teal-700 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Database size={22} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Supabase Cloud, Storage (Option 2B) & Google Sheets</h3>
              <p className="text-white/80 text-xs">PostgreSQL Tables • cotrac-media Storage Bucket • Direct Google Sheets Sync</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 sm:p-2 hover:bg-white/10 rounded-xl transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0 text-slate-700">
          {/* Status Indicator */}
          <div className={`p-4 rounded-2xl border flex items-start sm:items-center justify-between gap-3 ${
            isConfigured 
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
              : 'bg-amber-50/70 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-center gap-3">
              {isConfigured ? (
                <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle size={22} className="text-amber-600 shrink-0" />
              )}
              <div>
                <span className="font-bold text-sm block">
                  {isConfigured ? 'Supabase Project & Option 2B Storage Connected' : 'Waiting for Supabase Credentials'}
                </span>
                <p className="text-xs opacity-80 mt-0.5">
                  {isConfigured 
                    ? 'Connected to tbqnpzksvazcvtzwhmnj.supabase.co • Bucket: cotrac-media (URL references in PostgreSQL).' 
                    : 'Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shrink-0 ${
              isConfigured ? 'bg-emerald-200/60 text-emerald-800' : 'bg-amber-200/60 text-amber-800'
            }`}>
              {isConfigured ? 'Option 2B Active' : 'Setup Required'}
            </span>
          </div>

          {/* Section 1: Supabase & Option 2B Storage Bucket Setup */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <HardDrive size={13} className="text-emerald-600" />
              Supabase PostgreSQL & Option 2B Storage Bucket (`cotrac-media`)
            </h4>
            
            <div className="grid grid-cols-1 gap-2.5">
              {/* Step 1 */}
              <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">1</span>
                    <p className="font-bold text-sm text-slate-800">Execute Supabase Schema & Storage Bucket DDL</p>
                  </div>
                  <p className="text-xs text-slate-500 pl-7">
                    Creates the <code className="text-primary font-mono font-semibold">users</code>, <code className="text-primary font-mono font-semibold">attendance_records</code>, <code className="text-primary font-mono font-semibold">activities</code> tables and the <code className="text-emerald-700 font-mono font-semibold">cotrac-media</code> Storage Bucket for Option 2B URL offloading.
                  </p>
                </div>
                <div className="pl-7 sm:pl-0 shrink-0 flex items-center gap-2">
                  <button
                    onClick={handleCopySql}
                    className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copied ? 'Copied SQL!' : 'Copy SQL Script'}</span>
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">2</span>
                    <p className="font-bold text-sm text-slate-800">Verify Database & Offload Images to Storage Bucket (Option 2B)</p>
                  </div>
                  <p className="text-xs text-slate-500 pl-7">
                    Verifies tables, initializes the <code className="text-emerald-700 font-mono font-semibold">cotrac-media</code> bucket, and converts any inline Base64 photos/signatures into lightweight Storage URLs (~90 bytes per row).
                  </p>
                </div>
                <div className="pl-7 sm:pl-0 shrink-0">
                  <button
                    onClick={handleStartMigration}
                    disabled={isMigrating || !isConfigured}
                    className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-xs ${
                      isConfigured 
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <RefreshCw size={14} className={isMigrating ? 'animate-spin' : ''} />
                    <span>{isMigrating ? 'Optimizing...' : 'Verify & Optimize Storage'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          {progress && (
            <div className="bg-blue-50/70 border border-blue-200 p-4 rounded-2xl space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-blue-900">{progress.message}</span>
                <span className="font-semibold text-blue-700">
                  {progress.stage === 'completed' ? '100%' : progress.stage === 'failed' ? 'Failed' : 'In Progress'}
                </span>
              </div>
              <div className="w-full bg-blue-200/70 h-2.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    progress.stage === 'failed' 
                      ? 'bg-rose-500' 
                      : progress.stage === 'completed' 
                        ? 'bg-emerald-500' 
                        : 'bg-primary'
                  }`}
                  style={{
                    width: progress.stage === 'completed' 
                      ? '100%' 
                      : progress.totalUsers + progress.totalRecords > 0
                        ? `${Math.round(((progress.migratedUsers + progress.migratedRecords) / (progress.totalUsers + progress.totalRecords)) * 100)}%`
                        : '25%'
                  }}
                />
              </div>
              {progress.stage === 'completed' && (
                <p className="text-xs text-emerald-800 font-bold flex items-center gap-1.5 pt-1">
                  <CheckCircle2 size={15} />
                  Verified {progress.migratedUsers} users and {progress.migratedRecords} records in Supabase!
                </p>
              )}
              {progress.error && (
                <p className="text-xs text-rose-700 font-semibold pt-1">
                  {progress.error}
                </p>
              )}
            </div>
          )}

          {/* Section 2: Direct Supabase <-> Google Sheets Sync */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                  <FileSpreadsheet size={14} className="text-emerald-600" />
                  Direct Supabase ↔ Google Sheets Sync
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Connect your Google Sheet directly to Supabase PostgreSQL (REST API pull + real-time webhook push).
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyAppsScript}
                className="btn-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
              >
                {copiedScript ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedScript ? 'Copied Connector Script!' : 'Copy Google Apps Script'}</span>
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">How to connect in 60 seconds:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-slate-500">
                  <li>Open any Google Sheet → <strong>Extensions → Apps Script</strong>, paste the copied script, and click <strong>Save</strong>.</li>
                  <li>Use the <strong>⚡ COTRAC Supabase</strong> menu inside your Google Sheet to pull live rows directly from Supabase anytime.</li>
                  <li>For automatic real-time push on every Clock-In/Out, click <strong>Deploy → New deployment → Web app</strong> (Access: <em>Anyone</em>) and paste the Web App URL below:</li>
                </ol>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Google Sheets Web App URL (Optional for Real-Time Push & 1-Click Sync)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveSheetsConfig}
                    className="btn-secondary py-2 px-3.5 text-xs font-bold shrink-0"
                  >
                    Save URL
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncSheetsNow}
                    disabled={isSyncingSheets || !webhookUrl.trim()}
                    className={`py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-all ${
                      webhookUrl.trim()
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Send size={13} className={isSyncingSheets ? 'animate-pulse' : ''} />
                    <span>{isSyncingSheets ? 'Syncing...' : 'Sync Supabase to Sheet'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoSync}
                      onChange={(e) => {
                        setAutoSync(e.target.checked);
                        setGoogleSheetsAutoSync(e.target.checked);
                      }}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Auto-push every new Clock-In, Clock-Out & Visitor Pass to Google Sheets</span>
                  </label>
                  {lastSync && (
                    <span className="text-[11px] text-slate-400 font-medium">
                      Last synced: {new Date(lastSync).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                {sheetsStatusMsg && (
                  <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    sheetsStatusMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}>
                    {sheetsStatusMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>{sheetsStatusMsg.text}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Backup Button */}
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm text-slate-800">Offline JSON Backup</p>
              <p className="text-xs text-slate-400">Download a full JSON snapshot of your current Supabase records anytime.</p>
            </div>
            <button
              onClick={handleExportJson}
              disabled={isExporting}
              className="btn-secondary py-2 px-4 text-xs font-bold flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <Download size={14} />
              <span>{isExporting ? 'Generating...' : 'Export JSON Backup'}</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="btn-secondary py-2 px-5 text-xs font-bold"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default SupabaseMigrationModal;
