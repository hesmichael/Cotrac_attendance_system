import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Database, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Download, 
  ArrowRight, 
  RefreshCw, 
  X, 
  ExternalLink,
  ShieldCheck,
  Server,
  Users,
  FileSpreadsheet
} from 'lucide-react';
import { isSupabaseConfigured, getSupabase } from '../lib/supabase';
import { 
  verifySupabaseConnection, 
  exportAllDataAsJson, 
  MigrationProgress 
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
  const [isMigrating, setIsMigrating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [showSql, setShowSql] = useState(false);

  if (!isOpen) return null;

  const isConfigured = isSupabaseConfigured();

  const handleCopySql = async () => {
    try {
      const res = await fetch('/supabase-schema.sql');
      let sqlText = '';
      if (res.ok) {
        sqlText = await res.text();
      }
      if (!sqlText) {
        // Fallback core schema
        sqlText = `-- COTRAC Supabase Schema
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

CREATE POLICY "Allow anon read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Allow anon upsert users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read attendance" ON public.attendance_records FOR SELECT USING (true);
CREATE POLICY "Allow anon write attendance" ON public.attendance_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read activities" ON public.activities FOR SELECT USING (true);
CREATE POLICY "Allow anon insert activities" ON public.activities FOR ALL USING (true) WITH CHECK (true);
`;
      }
      await navigator.clipboard.writeText(sqlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy SQL:', e);
    }
  };

  const handleStartMigration = async () => {
    if (!isConfigured) {
      alert('Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Settings first.');
      return;
    }
    setIsMigrating(true);
    const result = await verifySupabaseConnection((p) => setProgress(p));
    setIsMigrating(false);
    if (result.success) {
      if (onSuccess) onSuccess();
    }
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
              <h3 className="text-lg font-bold">Supabase Cloud Database</h3>
              <p className="text-white/80 text-xs">Configure, verify, and back up attendance data</p>
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
                  {isConfigured ? 'Supabase Project Connected' : 'Waiting for Supabase Credentials'}
                </span>
                <p className="text-xs opacity-80 mt-0.5">
                  {isConfigured 
                    ? 'Connected to tbqnpzksvazcvtzwhmnj.supabase.co with publishable key.' 
                    : 'Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shrink-0 ${
              isConfigured ? 'bg-emerald-200/60 text-emerald-800' : 'bg-amber-200/60 text-amber-800'
            }`}>
              {isConfigured ? 'Active' : 'Setup Required'}
            </span>
          </div>

          {/* 3 Step Setup Guide */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Database Setup</h4>
            
            <div className="grid grid-cols-1 gap-2.5">
              {/* Step 1 */}
              <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">1</span>
                    <p className="font-bold text-sm text-slate-800">Execute Supabase Schema DDL</p>
                  </div>
                  <p className="text-xs text-slate-500 pl-7">
                    Create the required <code className="text-primary font-mono font-semibold">users</code>, <code className="text-primary font-mono font-semibold">attendance_records</code>, and <code className="text-primary font-mono font-semibold">activities</code> tables.
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
                    <p className="font-bold text-sm text-slate-800">Add Supabase API Keys</p>
                  </div>
                  <p className="text-xs text-slate-500 pl-7">
                    In your Supabase project dashboard, navigate to <strong>Project Settings → API</strong>. Provide <code className="font-mono text-[11px]">VITE_SUPABASE_URL</code> and <code className="font-mono text-[11px]">VITE_SUPABASE_ANON_KEY</code> in the Settings menu.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">3</span>
                    <p className="font-bold text-sm text-slate-800">Verify live database connection</p>
                  </div>
                  <p className="text-xs text-slate-500 pl-7">
                    Checks the live Supabase tables and reports the current user, attendance, and activity counts.
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
                    <span>{isMigrating ? 'Checking...' : 'Check Connection'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Migration Progress Bar */}
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
                  Successfully migrated {progress.migratedUsers} users and {progress.migratedRecords} records!
                </p>
              )}
              {progress.error && (
                <p className="text-xs text-rose-700 font-semibold pt-1">
                  {progress.error}
                </p>
              )}
            </div>
          )}

          {/* Backup Button */}
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm text-slate-800">Offline JSON Backup</p>
              <p className="text-xs text-slate-400">Download a full JSON snapshot of your current Supabase-backed records anytime.</p>
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
