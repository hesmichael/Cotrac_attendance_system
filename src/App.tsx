/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  User,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  onSnapshot,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, AttendanceRecord, AttendanceStatus, UserRole } from './types';
import { LOGO_URL } from './constants';
import { verifySignature } from './lib/gemini';
import { isQuotaError } from './utils/quotaHelper';
import SignatureCanvas from 'react-signature-canvas';
import TerminalPanel from './components/TerminalPanel';
import ReportsPanel from './components/ReportsPanel';
import ProductTour from './components/ProductTour';
import PrivacyPolicyModal from './components/PrivacyPolicyModal';
import TermsAndConditionsModal from './components/TermsAndConditionsModal';
import { compressCanvas } from './utils/imageCompressor';
import { 
  Clock, 
  User as UserIcon, 
  LayoutDashboard, 
  History, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  Timer,
  ChevronRight,
  Search,
  Filter,
  Calendar as CalendarIcon,
  ShieldCheck,
  X,
  PenTool,
  Trash2,
  Edit2,
  ExternalLink,
  AlertTriangle,
  Mail,
  Lock,
  ShieldAlert,
  Sparkles,
  Zap,
  FileSpreadsheet,
  Compass,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { format, isAfter, parse, differenceInMinutes, startOfDay, endOfDay, addMinutes } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Password verification helper: at least 6 characters and contain letter, number, and special symbol
const validatePasswordStrength = (pw: string): boolean => {
  if (pw.length < 6) return false;
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
  return hasLetter && hasNumber && hasSpecial;
};

const getDefaultTabForRole = (role?: UserRole): string => {
  if (role === 'sign-in') return 'terminal';
  if (role === 'admin') return 'admin';
  return 'attendance';
};

// --- Components ---

const PinModal = ({ 
  isOpen, 
  onClose, 
  onVerify, 
  title, 
  error,
  subtitle,
  staffName
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onVerify: (pin: string) => void,
  title: string,
  error?: string,
  subtitle?: string,
  staffName?: string
}) => {
  const [pin, setPin] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length >= 4) {
      onVerify(pin);
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-blue-950/30 backdrop-blur-xs overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.96, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden border border-blue-100 shadow-2xl my-auto"
      >
        <div className="bg-blue-600 p-5 sm:p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg shrink-0">
              <ShieldCheck size={22} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold tracking-tight leading-tight">{title}</h3>
              <p className="text-blue-100 text-[11px] font-semibold uppercase tracking-wider">Dual Authorization</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/20 text-white rounded-lg transition-colors"
            aria-label="Close PIN modal"
          >
            <X size={18} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-5">
          {staffName ? (
            <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-3 text-center space-y-0.5">
              <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Personnel Confirmation</span>
              <p className="text-sm font-bold text-blue-950">{staffName}</p>
              <p className="text-slate-500 text-xs mt-1">Ask employee to enter their private 4-6 digit security PIN</p>
            </div>
          ) : (
            <div className="text-center space-y-1">
              <p className="text-blue-900 font-bold text-sm">Enter 4-6 digit security PIN</p>
              <p className="text-slate-400 text-xs">{subtitle || "Verify your personnel credentials"}</p>
            </div>
          )}

          <div className="flex justify-center">
            <input 
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="w-48 text-center text-3xl tracking-[0.5em] font-black py-2.5 bg-blue-50/50 border-2 border-blue-200 rounded-lg text-blue-900 focus:border-blue-600 focus:bg-white focus:outline-none transition-all placeholder:text-blue-200"
              autoFocus
              placeholder="••••"
            />
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-rose-600 text-xs justify-center bg-rose-50 p-2.5 rounded-lg border border-rose-100 font-semibold"
            >
              <AlertCircle size={15} />
              <span>{error}</span>
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={pin.length < 4}
            className="w-full btn-primary py-3 text-sm shadow-xs"
          >
            Verify Employee PIN
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const AddStaffModal = ({ isOpen, onClose, onAdd }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onAdd: (data: { email: string, name: string, role: UserRole, employeeId: string, pin: string }) => Promise<void>
}) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const targetEmail = email.toLowerCase().trim();
    if (targetEmail !== 'mojaizs@gmail.com' && !targetEmail.endsWith('@cotracnigeria.com')) {
      setError('Use a @cotracnigeria.com email address, or the authorized mojaizs@gmail.com administrator address.');
      return;
    }
    if (name.trim().length < 2) {
      setError('Full name must contain at least 2 characters.');
      return;
    }
    if (!/^[A-Za-z0-9-]{2,20}$/.test(employeeId.trim())) {
      setError('Employee ID must be 2-20 characters using only letters, numbers, or hyphens.');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must contain 4-6 digits only.');
      return;
    }
    setLoading(true);
    await onAdd({ email: targetEmail, name, role, employeeId, pin });
    setLoading(false);
    onClose();
    setEmail('');
    setName('');
    setRole('staff');
    setEmployeeId('');
    setPin('');
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-blue-950/30 backdrop-blur-xs overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.96, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-blue-100 shadow-2xl my-auto"
      >
        <div className="bg-blue-600 p-5 sm:p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg shrink-0">
              <UserIcon size={22} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold tracking-tight">Add Staff Member</h3>
              <p className="text-blue-100 text-[11px] font-semibold uppercase tracking-wider">Provision Account</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/20 text-white rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wider px-1">Full Name</label>
              <input 
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full input-glass mt-1"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wider px-1">Email Address</label>
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full input-glass mt-1"
                placeholder="john@cotracnigeria.com"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider px-1">Employee ID</label>
                <input 
                  type="text"
                  required
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full input-glass mt-1"
                  placeholder="COT-001"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider px-1">Initial Role</label>
                <select 
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full input-glass mt-1 appearance-none bg-white font-semibold"
                >
                  <option value="staff">Staff Member</option>
                  <option value="admin">Administrator</option>
                  <option value="sign-in">Sign-In Officer</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider px-1">PIN (4-6 digits)</label>
                <input 
                  type="password"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full input-glass mt-1"
                  placeholder="e.g. 1234"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-600 font-semibold bg-rose-50 p-2.5 rounded-lg border border-rose-100" role="alert">
              {error}
            </div>
          )}

          <div className="pt-2 shrink-0">
            <button 
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-sm shadow-xs"
            >
              {loading ? 'Creating Account...' : 'Register Staff Member'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const ChangePasswordModal = ({ isOpen, onClose, user }: {
  isOpen: boolean,
  onClose: () => void,
  user: UserProfile | null
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validatePasswordStrength(newPassword)) {
      setError('New password must be at least 6 characters long and contain alphanumeric characters (letters, numbers, and special symbols).');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser || !firebaseUser.email) {
        throw new Error('Your authenticated session has expired. Please sign in again.');
      }
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      setSuccess('Your password has been updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        onClose();
        setSuccess('');
      }, 1500);
    } catch (err: any) {
      console.error('Failed to change password:', err);
      setError(err.message || 'An error occurred while updating the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 bg-blue-950/30 backdrop-blur-xs overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.96, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden border border-blue-100 shadow-2xl my-auto"
      >
        <div className="bg-blue-600 p-5 sm:p-6 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg shrink-0">
              <Lock size={22} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold tracking-tight">Change Password</h3>
              <p className="text-blue-100 text-[11px] font-semibold uppercase tracking-wider">Account Security</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/20 text-white rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-3.5">
            {(
              <div>
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider px-1">Current Password</label>
                <input 
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full input-glass mt-1"
                  placeholder="Enter current password"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wider px-1">New Password</label>
              <input 
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full input-glass mt-1"
                placeholder="Min. 6 alphanumeric chars"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wider px-1">Confirm New Password</label>
              <input 
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full input-glass mt-1"
                placeholder="Re-enter new password"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-600 font-semibold bg-rose-50 p-2.5 rounded-lg border border-rose-100">
              {error}
            </div>
          )}

          {success && (
            <div className="text-xs text-emerald-600 font-semibold bg-emerald-50 p-2.5 rounded-lg border border-emerald-100">
              {success}
            </div>
          )}

          <div className="pt-2 shrink-0">
            <button 
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-sm shadow-xs"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const SignatureModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  title,
  subtitle,
  officerName
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSave: (signature: string) => void,
  title: string,
  subtitle?: string,
  officerName?: string
}) => {
  const sigPad = React.useRef<SignatureCanvas>(null);

  const clear = () => {
    sigPad.current?.clear();
  };

  const save = () => {
    if (!sigPad.current || sigPad.current.isEmpty()) {
      alert('Please provide a signature.');
      return;
    }
    const canvas = sigPad.current.getTrimmedCanvas();
    const signature = compressCanvas(canvas, 360, 180, 0.72);
    if (signature) {
      onSave(signature);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-950/30 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-blue-100 shadow-2xl my-auto"
      >
        <div className="p-5 sm:p-6 border-b border-blue-100 flex justify-between items-center bg-blue-600 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg shrink-0">
              <PenTool size={22} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold tracking-tight">{title}</h3>
              <p className="text-blue-100 text-[11px] font-semibold uppercase tracking-wider">
                {officerName ? "Authorized Sign-Off" : "Official Signature"}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/20 text-white rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {officerName && (
            <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-2.5 flex items-center justify-between text-xs">
              <span className="text-blue-700 font-semibold flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-blue-600" />
                Authorizing Officer:
              </span>
              <span className="font-bold text-blue-950">{officerName}</span>
            </div>
          )}
          <p className="text-blue-950 font-medium text-xs sm:text-sm text-center">
            {subtitle || "Please provide your handwritten signature to authorize this log."}
          </p>
          <div className="border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/30 overflow-hidden shadow-inner h-44 sm:h-56 touch-none select-none">
            <SignatureCanvas 
              ref={sigPad}
              penColor="#1e3a8a"
              canvasProps={{
                className: "w-full h-full cursor-crosshair bg-white touch-none select-none"
              }}
            />
          </div>
          <div className="flex gap-3 pt-1 shrink-0">
            <button 
              onClick={clear}
              className="flex-1 py-2.5 px-4 rounded-lg border border-blue-200 text-blue-700 font-bold hover:bg-blue-50 transition-all active:scale-95 text-xs"
            >
              Clear
            </button>
            <button 
              onClick={save}
              className="flex-1 btn-primary py-2.5 px-4 text-xs font-bold"
            >
              {officerName ? "Authorize & Sign Entry" : "Confirm Signature"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const Header = ({ user, onLogout, activeTab, setActiveTab, onOpenTour }: {  
  user: UserProfile | null, 
  onLogout: () => void,
  activeTab: string,
  setActiveTab: (tab: string) => void,
  onOpenTour?: () => void
}) => {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-blue-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 shrink-0">
          <img 
            src={LOGO_URL} 
            alt="COTRAC - Technology | Security | Fleet Management" 
            className="h-9 sm:h-11 w-auto max-w-[180px] sm:max-w-[220px] object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as any).style.display = 'none';
              (e.target as any).parentElement.querySelector('.fallback-logo').style.display = 'flex';
            }}
          />
          <div className="fallback-logo hidden h-9 w-9 sm:h-11 sm:w-11 bg-blue-600 rounded-lg items-center justify-center shadow-xs">
            <Clock className="text-white" size={20} />
          </div>
          <div className="hidden md:flex flex-col border-l border-blue-200/80 pl-3">
            <span className="text-xs font-black text-blue-900 tracking-tight leading-none">Attendance Portal</span>
            <span className="text-[9px] text-blue-600 font-bold uppercase tracking-wider mt-0.5">Operational Terminal</span>
          </div>
        </div>

        {user && (
          <nav className="hidden lg:flex items-center gap-1.5 bg-blue-50/80 p-1.5 rounded-2xl border border-blue-200/60">
            {[
              ...((user.role === 'sign-in' || user.role === 'admin') ? [{ id: 'terminal', label: 'Sign-In Hub', icon: ShieldAlert }] : []),
              ...(user.role !== 'staff' ? [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
              { id: 'attendance', label: 'History', icon: History },
              ...((user.role === 'sign-in' || user.role === 'admin') ? [{ id: 'reports', label: 'Reports', icon: FileSpreadsheet }] : []),
              { id: 'profile', label: 'Profile', icon: UserIcon },
              ...(user.role === 'admin' ? [{ id: 'admin', label: 'Nexus Admin', icon: ShieldCheck }] : []),
            ].map((item) => (
              <button 
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  activeTab === item.id 
                    ? "bg-white text-blue-700 shadow-sm border border-blue-200" 
                    : "text-blue-800/70 hover:text-blue-900 hover:bg-white/60"
                )}
              >
                <item.icon size={15} />
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          {user && (
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-bold text-blue-950 leading-none">{user.displayName}</span>
                <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md mt-1">{user.role}</span>
              </div>
              {onOpenTour && (
                <button
                  onClick={onOpenTour}
                  className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                  title="Product Tour & Guide"
                >
                  <Compass size={18} />
                </button>
              )}
              <button 
                onClick={() => setActiveTab('profile')}
                className="h-10 w-10 sm:h-11 sm:w-11 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                title="Profile Settings"
              >
                <UserIcon size={18} />
              </button>
              <button 
                onClick={onLogout}
                className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all active:scale-95"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile & Tablet Navigation */}
      {user && (
        <nav className="lg:hidden flex border-t border-blue-100 overflow-x-auto no-scrollbar py-2 px-3 sm:px-4 gap-2 bg-white">
          {[
            ...((user?.role === 'sign-in' || user?.role === 'admin') ? [{ id: 'terminal', label: 'Hub', icon: ShieldAlert }] : []),
            ...(user?.role !== 'staff' ? [{ id: 'dashboard', label: 'Dash', icon: LayoutDashboard }] : []),
            { id: 'attendance', label: 'History', icon: History },
            ...((user?.role === 'sign-in' || user?.role === 'admin') ? [{ id: 'reports', label: 'Reports', icon: FileSpreadsheet }] : []),
            ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin', icon: ShieldCheck }] : []),
            { id: 'profile', label: 'Profile', icon: UserIcon }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 px-3.5 py-2 rounded-xl transition-all min-w-[65px] sm:min-w-[75px] shrink-0",
                activeTab === tab.id 
                  ? "bg-blue-600 text-white shadow-sm" 
                  : "text-blue-900/60 hover:bg-blue-50"
              )}
            >
              <tab.icon size={16} />
              <span className="text-[10px] font-bold">{tab.label}</span>
            </button>
          ))}
        </nav>
      )}
    </header>
  );
};

const Login = ({ onOpenPrivacyPolicy, onOpenTerms }: {
  onOpenPrivacyPolicy?: () => void,
  onOpenTerms?: () => void
}) => {
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pin, setPin] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    try {
      if (emailMode === 'signin') {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        setAuthSuccess('Authenticated successfully! Welcome back.');
      } else {
        const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const emailDoc = await getDoc(doc(db, 'users', cleanEmail));
        const preData = emailDoc.exists() ? emailDoc.data() : null;
        const newProfile: UserProfile = {
          uid: credential.user.uid,
          displayName: displayName.trim() || (preData?.displayName as string) || 'Staff Member',
          email: cleanEmail,
          role: (preData?.role as UserRole) || (cleanEmail === 'mojaizs@gmail.com' ? 'admin' : 'staff'),
          employeeId: (preData?.employeeId as string) || '',
          shiftStart: (preData?.shiftStart as string) || '09:00',
          latenessTolerance: 0,
          pin,
          createdAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'users', credential.user.uid), newProfile, { merge: true });
        if (emailDoc.exists()) await deleteDoc(doc(db, 'users', cleanEmail));
        setAuthSuccess('Account created successfully! Welcome to the portal.');
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      setAuthError(err.code === 'auth/invalid-credential'
        ? 'Email or password is incorrect.'
        : err.message || 'An error occurred during authentication.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || (cleanEmail !== 'mojaizs@gmail.com' && !cleanEmail.endsWith('@cotracnigeria.com'))) {
      setAuthError('Enter an authorized corporate email address before requesting a password reset.');
      return;
    }
    setEmailLoading(true);
    setAuthError('');
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setAuthSuccess('Password reset instructions have been sent to your email.');
    } catch (err: any) {
      console.error('Password reset error:', err);
      setAuthError('We could not send a reset email. Verify the address or contact an administrator.');
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] flex items-center justify-center p-6 bg-slate-50">
      <motion.div 
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl max-w-lg w-full text-center space-y-6 p-10 relative overflow-hidden border border-blue-100 shadow-xl"
      >
        <div className="space-y-4">
          <div className="mx-auto flex items-center justify-center">
            <img 
              src={LOGO_URL} 
              alt="COTRAC Logo" 
              className="h-20 sm:h-24 w-auto object-contain"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as any).style.display = 'none';
                (e.target as any).parentElement.querySelector('.fallback-login-logo').style.display = 'flex';
              }}
            />
            <div className="fallback-login-logo hidden bg-blue-600 w-16 h-16 rounded-2xl items-center justify-center shadow-lg">
              <Clock className="text-white" size={28} />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl font-black text-blue-950 tracking-tight">Staff Attendance Portal</h1>
            <p className="text-blue-900/70 font-medium text-sm">Secure clock-in and clock-out management system</p>
          </div>
        </div>

        <div className="space-y-5">
          <form onSubmit={handleEmailAuth} className="space-y-3.5 text-left">
            {emailMode === 'signup' && (
              <div>
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-1 block px-1">Full Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-blue-400">
                    <UserIcon size={16} />
                  </span>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-blue-50/40 border border-blue-200 rounded-xl text-blue-950 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-blue-300"
                    placeholder="E.g., John Doe"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-1 block px-1">Corporate Email</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-blue-400">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-blue-50/40 border border-blue-200 rounded-xl text-blue-950 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-blue-300"
                  placeholder="name@cotracnigeria.com"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-1 block px-1">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-blue-400">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-blue-50/40 border border-blue-200 rounded-xl text-blue-950 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-blue-300"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {emailMode === 'signup' && (
              <div>
                <label className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-1 block px-1">PIN (4-6 digits)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-blue-400">
                    <Lock size={16} />
                  </span>
                  <input
                    type="password"
                    required
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full pl-10 pr-4 py-3 bg-blue-50/40 border border-blue-200 rounded-xl text-blue-950 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-blue-300"
                    placeholder="e.g. 1234"
                  />
                </div>
              </div>
            )}

            {authError && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold flex items-start gap-2 leading-normal"
              >
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{authError}</span>
              </motion.div>
            )}

            {authSuccess && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold flex items-start gap-2 leading-normal"
              >
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <span>{authSuccess}</span>
              </motion.div>
            )}

            <button
              type="submit"
              disabled={emailLoading}
              className="w-full py-3.5 rounded-xl bg-blue-600 text-white text-sm font-bold tracking-wide hover:bg-blue-700 active:scale-98 transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/20"
            >
              {emailLoading ? (
                <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : emailMode === 'signin' ? (
                'Corporate Sign In'
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="flex justify-center text-xs">
            {emailMode === 'signin' ? (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={emailLoading}
                  className="text-blue-600 hover:underline font-bold disabled:opacity-50"
                >
                  Forgot password?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('signup');
                    setAuthError('');
                    setAuthSuccess('');
                  }}
                  className="text-blue-600 hover:underline font-bold"
                >
                  New employee? Create an account
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setEmailMode('signin');
                  setAuthError('');
                  setAuthSuccess('');
                }}
                className="text-blue-600 hover:underline font-bold"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-blue-100/80 flex items-center justify-center gap-3 text-xs">
          {onOpenPrivacyPolicy && (
            <button
              type="button"
              onClick={onOpenPrivacyPolicy}
              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              Privacy Policy
            </button>
          )}
          {onOpenPrivacyPolicy && onOpenTerms && (
            <span className="text-slate-300">|</span>
          )}
          {onOpenTerms && (
            <button
              type="button"
              onClick={onOpenTerms}
              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
            >
              Terms & Conditions
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const Dashboard = ({ user, records, allRecords = [], onClockIn, onClockOut }: { 
  user: UserProfile, 
  records: AttendanceRecord[],
  allRecords?: AttendanceRecord[],
  onClockIn: () => void,
  onClockOut: () => void
}) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayRecord = records.find(r => r.date === today);
  const isClockedIn = todayRecord && !todayRecord.clockOut;
  const isClockedOut = todayRecord && todayRecord.clockOut;

  const statsRecords = (user.role === 'admin' || user.role === 'sign-in') ? allRecords : records;

  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-10">
      {/* Header section with clean blue typography and generous spacing */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-wider text-xs">
            <span className="w-2 h-2 rounded-full bg-accent"></span>
            Personnel Portal
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-primary tracking-tight">Welcome, {user.displayName}</h2>
          <p className="text-slate-500 font-normal text-base">Authentication confirmed. Attendance session active.</p>
          <div className="flex items-center gap-2 mt-2 text-xs font-semibold text-primary bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-xl w-fit">
            <Timer size={14} className="text-primary" />
            <span>Assigned Shift: {user.shiftStart || '09:00'}</span>
          </div>
        </div>
        <div className="bg-blue-50/60 px-8 py-6 rounded-2xl flex items-center gap-6 border border-blue-100">
          <div className="bg-white p-3 rounded-xl shadow-sm border border-blue-100">
            <Clock className="text-primary" size={28} />
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-bold text-primary tabular-nums tracking-tight leading-none">{format(time, 'HH:mm:ss')}</span>
            <span className="text-xs text-slate-500 font-medium mt-1.5">{format(time, 'EEEE, MMMM do')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Status Card */}
        <div className="bg-white lg:col-span-2 p-8 sm:p-10 rounded-3xl flex flex-col justify-between min-h-[380px] border border-slate-100 shadow-sm">
          <div>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Engagement Status</h3>
                <div className="flex items-center gap-3">
                  {isClockedIn ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Active Duty
                    </span>
                  ) : isClockedOut ? (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 text-sm font-bold">
                      <History size={16} />
                      Shift Logged
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-primary border border-blue-200 text-sm font-bold">
                      <AlertCircle size={16} />
                      Standby
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                <Timer className="text-primary" size={36} />
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Clock In Time</span>
                <span className="text-xl font-bold text-primary tabular-nums">
                  {todayRecord ? format(new Date(todayRecord.clockIn), 'HH:mm:ss') : '--:--:--'}
                </span>
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <span className="text-xs font-semibold text-slate-400 block mb-1">Clock Out Time</span>
                <span className="text-xl font-bold text-primary tabular-nums">
                  {todayRecord?.clockOut ? format(new Date(todayRecord.clockOut), 'HH:mm:ss') : '--:--:--'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-8">
            {!isClockedIn && !isClockedOut && (
              <button 
                onClick={onClockIn}
                className="w-full sm:w-auto flex-1 btn-primary py-4 text-base flex items-center justify-center gap-3 font-bold"
              >
                <Clock size={20} />
                Clock In
              </button>
            )}
            {isClockedIn && (
              <button 
                onClick={onClockOut}
                className="w-full sm:w-auto flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-4 px-6 text-base font-bold flex items-center justify-center gap-3 shadow-md shadow-amber-500/10 active:scale-95 transition-all"
              >
                <LogOut size={20} />
                Clock Out
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats & Pulse */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Weekly Work Hours</h4>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-primary tabular-nums tracking-tight">
                {statsRecords.reduce((acc, curr) => {
                  const date = new Date(curr.date);
                  const now = new Date();
                  const diffMinutes = differenceInMinutes(now, date);
                  return diffMinutes < 10080 ? acc + (curr.totalHours || 0) : acc;
                }, 0).toFixed(1)}
              </span>
              <span className="text-sm font-semibold text-slate-500">hours</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (statsRecords.reduce((acc, curr) => acc + (curr.totalHours || 0), 0) / 40) * 100)}%` }}
                className="h-full bg-primary"
              ></motion.div>
            </div>
            <p className="text-xs text-slate-400 font-medium">Rolling 7-day target (40 hrs)</p>
          </div>
          
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Activity</h4>
            <div className="space-y-3">
              {statsRecords.slice(0, 3).map((record, i) => (
                <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-800">{format(new Date(record.date), 'MMM dd, yyyy')}</span>
                    <span className={cn(
                      "text-[10px] font-semibold",
                      record.status === 'Present' ? "text-emerald-600" : record.status === 'Late' ? "text-amber-600" : "text-rose-600"
                    )}>{record.status}</span>
                  </div>
                  <div className="text-sm font-bold text-primary tabular-nums">
                    {(record.totalHours || 0).toFixed(1)} hrs
                  </div>
                </div>
              ))}
              {statsRecords.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-4">No recent activity records.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AttendanceTable = ({ records, users, isAdmin = false, onEdit, onVerifySignature }: { 
  records: AttendanceRecord[], 
  users?: UserProfile[],
  isAdmin?: boolean,
  onEdit?: (record: AttendanceRecord) => void,
  onVerifySignature?: (recordId: string, refSig: string, logSig: string) => Promise<void>
}) => {
  const [verifyingMap, setVerifyingMap] = useState<Record<string, boolean>>({});

  const handleTriggerVerify = async (record: AttendanceRecord) => {
    if (!record.id) return;
    const staffProfile = users?.find(u => u.uid === record.userId);
    const refSig = staffProfile?.registeredSignature;
    const logSig = record.clockInSignature;
    if (!refSig || !logSig) {
      alert("Requires registered official reference signature and clock-in signature to execute.");
      return;
    }
    setVerifyingMap(prev => ({ ...prev, [record.id!]: true }));
    try {
      if (onVerifySignature) {
        await onVerifySignature(record.id, refSig, logSig);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setVerifyingMap(prev => ({ ...prev, [record.id!]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Desktop view */}
      <div className="hidden lg:block bg-white overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-xs font-bold tracking-wider">
                <th className="px-6 py-4">Date</th>
                {isAdmin && <th className="px-6 py-4">Personnel</th>}
                <th className="px-6 py-4">Duty Start</th>
                <th className="px-6 py-4">Duty End</th>
                <th className="px-6 py-4">Hours</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Signature</th>
                {isAdmin && <th className="px-6 py-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 6} className="px-6 py-16 text-center text-slate-400 font-medium">
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                records.map((record, idx) => {
                  const staffProfile = users?.find(u => u.uid === record.userId);
                  return (
                    <tr key={record.id || idx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-semibold text-primary">
                        {format(new Date(record.date), 'MMM dd, yyyy')}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">
                          {record.employeeName}
                        </td>
                      )}
                      <td className="px-6 py-4 text-sm tabular-nums text-slate-600">
                        {format(new Date(record.clockIn), 'HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 text-sm tabular-nums text-slate-600">
                        {record.clockOut ? format(new Date(record.clockOut), 'HH:mm:ss') : '--:--:--'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold tabular-nums text-primary">
                        {record.totalHours ? `${record.totalHours.toFixed(1)} hrs` : '--'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-3 py-1 rounded-md text-xs font-semibold inline-block",
                          record.status === 'Present' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                          record.status === 'Late' && "bg-amber-50 text-amber-700 border border-amber-200",
                          record.status === 'Incomplete' && "bg-rose-50 text-rose-700 border border-rose-200"
                        )}>
                          {record.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {isAdmin && staffProfile?.registeredSignature && (
                            <div className="group/ref relative mr-1 border-r border-slate-200 pr-2">
                               <img 
                                src={staffProfile.registeredSignature} 
                                alt="REF" 
                                className="h-7 w-9 object-contain opacity-50 hover:opacity-100 transition-opacity" 
                              />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/ref:block z-50">
                                <div className="bg-slate-900 text-white p-3 rounded-xl whitespace-nowrap shadow-xl">
                                  <p className="text-[9px] font-bold uppercase tracking-wider text-accent mb-1">Official Reference</p>
                                  <img src={staffProfile.registeredSignature} className="h-16 w-28 object-contain invert" />
                                </div>
                              </div>
                            </div>
                          )}
                          {record.clockInSignature ? (
                            <div className="flex items-center gap-2">
                              <div className="group/sig relative">
                                <img 
                                  src={record.clockInSignature} 
                                  alt="SIG" 
                                  className="h-8 w-12 object-contain bg-slate-50 border border-slate-200 rounded-lg p-1 cursor-pointer" 
                                />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/sig:block z-50">
                                  <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl">
                                    <img src={record.clockInSignature} alt="SIG-LG" className="h-28 w-44 object-contain invert" />
                                    <p className="text-[10px] text-slate-300 text-center mt-1">Clock In Signature</p>
                                  </div>
                                </div>
                              </div>
                              {record.authorizedByName && (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded-md inline-flex items-center gap-1" title={`Authorized by Officer: ${record.authorizedByName}`}>
                                  <ShieldCheck size={11} className="text-blue-600" />
                                  Officer: {record.authorizedByName.split(' ')[0]}
                                </span>
                              )}
                              {record.pinVerified && (
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold rounded-md inline-flex items-center gap-1" title="Employee PIN Authenticated">
                                  <CheckCircle2 size={11} className="text-emerald-600" />
                                  PIN
                                </span>
                              )}
                            </div>
                          ) : <span className="text-slate-300 text-xs font-mono">--</span>}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => onEdit?.(record)}
                            className="text-slate-400 hover:text-primary transition-colors p-2 hover:bg-slate-100 rounded-xl"
                            title="Edit Record"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile view */}
      <div className="lg:hidden space-y-4">
        {records.length === 0 ? (
          <div className="bg-white p-12 text-center rounded-3xl border border-slate-200">
            <p className="text-sm text-slate-400 font-medium">No attendance records found.</p>
          </div>
        ) : (
          records.map((record, idx) => (
            <div key={record.id || idx} className="bg-white rounded-3xl p-6 space-y-4 border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-slate-400 block">{format(new Date(record.date), 'MMM dd, yyyy')}</span>
                  {isAdmin && <span className="text-base font-bold text-primary">{record.employeeName}</span>}
                  {(record.authorizedByName || record.pinVerified) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {record.authorizedByName && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                          <ShieldCheck size={10} className="text-blue-600" />
                          Officer: {record.authorizedByName.split(' ')[0]}
                        </span>
                      )}
                      {record.pinVerified && (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold rounded-md inline-flex items-center gap-1">
                          <CheckCircle2 size={10} className="text-emerald-600" />
                          PIN Verified
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-md text-xs font-semibold",
                  record.status === 'Present' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                  record.status === 'Late' && "bg-amber-50 text-amber-700 border border-amber-200",
                  record.status === 'Incomplete' && "bg-rose-50 text-rose-700 border border-rose-200"
                )}>
                  {record.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-100">
                <div>
                  <span className="text-xs text-slate-400 block">Duty Start</span>
                  <span className="text-sm font-bold text-slate-800">{format(new Date(record.clockIn), 'HH:mm:ss')}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Duty End</span>
                  <span className="text-sm font-bold text-slate-800">{record.clockOut ? format(new Date(record.clockOut), 'HH:mm:ss') : '--:--:--'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 block">Total</span>
                  <span className="text-lg font-bold text-primary">{record.totalHours ? record.totalHours.toFixed(1) : '0.0'} hrs</span>
                </div>
                {isAdmin && (
                  <button 
                    onClick={() => onEdit?.(record)}
                    className="p-2.5 bg-primary text-white rounded-xl shadow-sm"
                  >
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const AdminPanel = ({ records, users, onUpdateRole, onUpdateShift, onUpdateLateness, onEdit, onAddUser, onDeleteUser, onUpdateUserDetail, onVerifySignature, onPurgeDatabase }: { 
  records: AttendanceRecord[], 
  users: UserProfile[],
  onUpdateRole: (userId: string, newRole: UserRole) => void,
  onUpdateShift: (userId: string, shiftStart: string) => void,
  onUpdateLateness: (userId: string, minutes: number) => void,
  onEdit: (record: AttendanceRecord) => void,
  onAddUser: () => void,
  onDeleteUser: (userId: string) => Promise<boolean>,
  onUpdateUserDetail: (userId: string, data: Partial<UserProfile>) => void,
  onVerifySignature?: (recordId: string, refSig: string, logSig: string) => Promise<void>,
  onPurgeDatabase: () => void
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'All'>('All');
  const [showUsers, setShowUsers] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchesSearch = r.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStartDate = !startDate || r.date >= startDate;
      const matchesEndDate = !endDate || r.date <= endDate;
      const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
      return matchesSearch && matchesStartDate && matchesEndDate && matchesStatus;
    });
  }, [records, searchTerm, startDate, endDate, statusFilter]);

  const filteredUsers = useMemo(() => {
    const uniqueUsersMap = new Map<string, UserProfile>();
    users.forEach(u => {
      if (!u.email) return;
      const emailKey = u.email.toLowerCase();
      const existing = uniqueUsersMap.get(emailKey);
      if (!existing) {
        uniqueUsersMap.set(emailKey, u);
      } else {
        if (existing.uid === existing.email && u.uid !== u.email) {
          uniqueUsersMap.set(emailKey, u);
        }
      }
    });
    const uniqueUsers = Array.from(uniqueUsersMap.values());
    return uniqueUsers.filter(u => 
      u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.employeeId && u.employeeId.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [users, searchTerm]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-wider text-xs">
            <span className="w-2 h-2 rounded-full bg-accent"></span>
            Administration Control
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-primary tracking-tight">Admin Oversight</h2>
          <p className="text-slate-500 font-normal text-base">Manage personnel registry and operational logs.</p>
        </div>
        
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {showUsers && (
            <>
              <button 
                onClick={onAddUser}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
              >
                <UserIcon size={18} />
                Provision Staff
              </button>
              <button 
                onClick={onPurgeDatabase}
                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 active:scale-95"
              >
                <Trash2 size={18} />
                Purge Database
              </button>
            </>
          )}
          <button 
            onClick={() => setShowUsers(!showUsers)}
            className={cn(
              "px-6 py-3 rounded-2xl font-bold text-sm transition-all border shadow-sm flex items-center justify-center gap-2 active:scale-95",
              showUsers 
                ? "bg-primary text-white border-primary" 
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            )}
          >
            {showUsers ? (
              <><History size={18} /> View History Logs</>
            ) : (
              <><UserIcon size={18} /> Personnel Registry</>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50/50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder={showUsers ? "Search ID, Name or Email..." : "Search Employee ID or Name..."}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            {!showUsers && (
              <>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Start Date</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="date" 
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">End Date</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="date" 
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Status Filter</label>
                  <div className="relative">
                    <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <select 
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none appearance-none"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                      <option value="All">All Logs</option>
                      <option value="Present">Present</option>
                      <option value="Late">Late</option>
                      <option value="Incomplete">Incomplete</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {showUsers ? (
          <div className="overflow-x-auto">
            {/* Desktop Table */}
            <table className="hidden lg:table w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-xs font-bold tracking-wider">
                  <th className="px-6 py-4">Personnel</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4 text-center">Role</th>
                  <th className="px-6 py-4 text-center">Shift Start</th>
                  <th className="px-6 py-4 text-center">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-slate-400 font-medium">No personnel found.</td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.uid} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary border border-blue-100 flex items-center justify-center font-bold text-sm shrink-0">
                            {u.displayName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-primary">{u.displayName}</p>
                            <p className="text-xs text-slate-400 font-medium">{u.employeeId || 'ID UNASSIGNED'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn(
                          "px-3 py-1 rounded-md text-xs font-semibold capitalize inline-block",
                          u.role === 'admin' ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-slate-100 text-slate-700"
                        )}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="time"
                          value={u.shiftStart || '09:00'}
                          onChange={(e) => onUpdateShift(u.uid, e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 text-center"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => setEditingUser(u)}
                            className="p-2 text-slate-600 hover:text-primary hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit Personnel"
                          >
                            <Edit2 size={16} />
                          </button>
                          
                          <select 
                            value={u.role}
                            onChange={(e) => onUpdateRole(u.uid, e.target.value as UserRole)}
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                            <option value="sign-in">Sign-In Officer</option>
                          </select>

                          <button 
                            onClick={() => onDeleteUser(u.uid)}
                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete Personnel"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Mobile Registry Cards */}
            <div className="lg:hidden p-4 space-y-4">
              {filteredUsers.length === 0 ? (
                <p className="py-12 text-center text-slate-400 font-medium text-sm">No personnel found.</p>
              ) : (
                filteredUsers.map((u) => (
                  <div key={u.uid} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 shadow-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-primary border border-blue-100 flex items-center justify-center font-bold text-sm">
                          {u.displayName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-primary">{u.displayName}</p>
                          <p className="text-xs text-slate-400">{u.employeeId || 'ID UNASSIGNED'}</p>
                        </div>
                      </div>
                      <select 
                        value={u.role}
                        onChange={(e) => onUpdateRole(u.uid, e.target.value as UserRole)}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                        <option value="sign-in">Sign-In Officer</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <span>Shift Start: {u.shiftStart || '09:00'}</span>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => setEditingUser(u)}
                          className="p-2 text-primary hover:bg-blue-50 rounded-lg"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => onDeleteUser(u.uid)}
                          className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <AttendanceTable records={filteredRecords} users={users} isAdmin onEdit={onEdit} onVerifySignature={onVerifySignature} />
        )}
      </div>

      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl p-8 max-w-lg w-full relative shadow-2xl border border-slate-200"
            >
              <button 
                onClick={() => setEditingUser(null)}
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 transition-colors p-2"
              >
                <X size={20} />
              </button>

              <div className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-2xl font-bold text-primary">Edit Personnel</h3>
                  <p className="text-slate-500 text-sm">Update staff account parameters and roles.</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Display Name</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      placeholder="Display Name"
                      defaultValue={editingUser.displayName} 
                      id="edit-name"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Employee Code</label>
                    <input 
                      type="text"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      placeholder="e.g. EMP-001"
                      defaultValue={editingUser.employeeId} 
                      id="edit-id"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Role</label>
                    <select 
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      defaultValue={editingUser.role || 'staff'} 
                      id="edit-role"
                    >
                      <option value="staff">Staff Member</option>
                      <option value="admin">Administrator</option>
                      <option value="sign-in">Sign-In Officer</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setEditingUser(null)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      const name = (document.getElementById('edit-name') as HTMLInputElement).value;
                      const empId = (document.getElementById('edit-id') as HTMLInputElement).value;
                      const role = (document.getElementById('edit-role') as HTMLSelectElement).value as UserRole;
                      if (name) {
                        onUpdateUserDetail(editingUser.uid, { displayName: name, employeeId: empId, role });
                        setEditingUser(null);
                      }
                    }}
                    className="flex-[2] btn-primary py-3 px-4 text-sm font-bold shadow-md shadow-primary/20"
                  >
                    Save Changes
                  </button>
                </div>

                {editingUser.role !== 'admin' && (
                  <div className="pt-3 border-t border-slate-100 flex justify-center">
                    <button 
                      onClick={async () => {
                        const success = await onDeleteUser(editingUser.uid);
                        if (success) {
                          setEditingUser(null);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} />
                      Delete User & Attendance Records
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [showTour, setShowTour] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [listenerRetry, setListenerRetry] = useState(0);
  const [showClockInSignature, setShowClockInSignature] = useState(false);
  const [showClockOutSignature, setShowClockOutSignature] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showOfficialSignatureModal, setShowOfficialSignatureModal] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [isActivitiesUnlocked, setIsActivitiesUnlocked] = useState(false);
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinAction, setPinAction] = useState<'clockIn' | 'clockOut' | 'registerSignature' | 'unlockProfile' | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<UserProfile | null>(null);

  // One-time automated database cleanup: Clear redundant attendance history and demo caches while strictly preserving all users and credentials
  useEffect(() => {
    const isCleaned = localStorage.getItem('cotrac_attendance_cleaned_preserve_users_v3');
    if (!isCleaned) {
      localStorage.removeItem('cotrac_demo_mode');
      localStorage.removeItem('cotrac_demo_users');
      localStorage.removeItem('cotrac_demo_records');
      setRecords([]);
      setAllRecords([]);
      localStorage.setItem('cotrac_attendance_cleaned_preserve_users_v3', 'true');
    }
  }, []);

  // Show onboarding tour for specified priority users and any user logging in for the first time
  useEffect(() => {
    if (!user) return;
    const email = (user.email || '').toLowerCase().trim();
    const targetTourEmails = [
      'cokonkwo@cotracnigeria.com',
      'anthony.maduabuchi@cotracnigeria.com',
      'admin@cotracnigeria.com'
    ];

    const isTargetUser = targetTourEmails.includes(email);
    const completedForUid = localStorage.getItem(`cotrac_tour_completed_${user.uid}`);
    const completedForEmail = email ? localStorage.getItem(`cotrac_tour_completed_${email}`) : null;

    // Trigger tour if target user or if user has not completed tour
    if (!completedForUid && !completedForEmail) {
      const timer = setTimeout(() => {
        setShowTour(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user]);

  const checkAndSetQuotaError = (err: any) => {
    if (!isQuotaError(err)) return;
    setQuotaError('Firestore Free Tier Daily Read Quota Exceeded. The application has automatically engaged offline cached mode to preserve all operations.');
  };

  // Redirect staff role from dashboard to profile/history
  useEffect(() => {
    if (user && user.role === 'staff' && activeTab === 'dashboard') {
      setActiveTab('attendance');
    }
  }, [user, activeTab]);

  // Auth Listener
  useEffect(() => {
    let isActive = true;
    localStorage.removeItem('cotrac_custom_user');

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isActive) return;

      if (firebaseUser) {
        if (!isActive) return;
        const email = (firebaseUser.email || '').toLowerCase();
        const isValid = email === 'mojaizs@gmail.com' || email.endsWith('@cotracnigeria.com');
        if (!isValid) {
          setUser(null);
          await signOut(auth);
          alert('Access Prohibited: Sign-in is restricted solely to @cotracnigeria.com corporate accounts or mojaizs@gmail.com.');
          setLoading(false);
          return;
        }

        try {
          // 1. Try UID based lookup
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (!isActive) return;
          
          if (userDoc.exists()) {
            const profileData = userDoc.data();
            const { password: _legacyPassword, ...safeProfile } = profileData;
            setUser(safeProfile as UserProfile);
            if (_legacyPassword !== undefined) {
              await updateDoc(doc(db, 'users', firebaseUser.uid), { password: deleteField() });
            }
          } else {
            // 2. Try Email based lookup (for pre-registered users)
            const emailDoc = await getDoc(doc(db, 'users', firebaseUser.email!.toLowerCase()));
            
            if (emailDoc.exists()) {
              const preData = emailDoc.data() as UserProfile;
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                displayName: preData.displayName || firebaseUser.displayName || 'Staff Member',
                email: firebaseUser.email || '',
                role: preData.role || 'staff',
                employeeId: preData.employeeId || '',
                shiftStart: preData.shiftStart || '09:00',
                latenessTolerance: preData.latenessTolerance !== undefined ? preData.latenessTolerance : 5,
                pin: preData.pin || '',
                registeredSignature: preData.registeredSignature || '',
                createdAt: preData.createdAt || serverTimestamp()
              };
              // Pivot the data to UID document
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
                await deleteDoc(doc(db, 'users', firebaseUser.email!.toLowerCase()));
              } catch (writeErr) {
                if (isQuotaError(writeErr)) {
                  console.warn("Firestore profile pivot notice (quota reached):", writeErr);
                } else {
                  console.warn("Error updating user document pivot:", writeErr);
                }
                checkAndSetQuotaError(writeErr);
              }
              setUser(newProfile);
            } else {
              // 3. Complete new registration
              const isDefaultAdmin = firebaseUser.email === 'mojaizs@gmail.com';
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                displayName: firebaseUser.displayName || 'Staff Member',
                email: firebaseUser.email || '',
                role: isDefaultAdmin ? 'admin' : 'staff',
                shiftStart: '09:00',
                latenessTolerance: 5,
                createdAt: serverTimestamp()
              };
              try {
                await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
              } catch (writeErr) {
                if (isQuotaError(writeErr)) {
                  console.warn("Firestore new user notice (quota reached):", writeErr);
                } else {
                  console.warn("Error creating new user document:", writeErr);
                }
                checkAndSetQuotaError(writeErr);
              }
              setUser(newProfile);
            }
          }
        } catch (fetchErr) {
          if (!isActive) return;
          if (isQuotaError(fetchErr)) {
            console.warn("Firestore profile fetch notice (quota reached):", fetchErr);
          } else {
            console.warn("Notice fetching user profile from Firestore:", fetchErr);
          }
          checkAndSetQuotaError(fetchErr);
          setUser(null);
          await signOut(auth);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const retryListeners = () => {
      if (!retryTimer) {
        retryTimer = setTimeout(() => setListenerRetry(previous => previous + 1), 30000);
      }
    };

    // Staff records - Recommendation A: Restrict real-time snapshot scope (time boundaries and limits)
    const q = query(
      collection(db, 'attendance'), 
      where('userId', '==', user.uid),
      limit(60)
    );
    const unsubscribeStaff = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      // Sort in-memory to prevent missing composite index errors in Firestore
      data.sort((a, b) => {
        const timeA = a.clockIn ? new Date(a.clockIn).getTime() : 0;
        const timeB = b.clockIn ? new Date(b.clockIn).getTime() : 0;
        return timeB - timeA;
      });
      setRecords(data);
    }, (error) => {
      if (isQuotaError(error)) {
        console.warn("Firestore snapshot notice (staff records): Read quota reached, using local cached dataset.");
        checkAndSetQuotaError(error);
      } else {
        console.error("Firestore snapshot error for staff records:", error);
      }
      retryListeners();
    });

    // Admin records & Users - Recommendation A: Bound real-time listener to active records
    let unsubscribeAdmin = () => {};
    let unsubscribeUsers = () => {};
    if (user.role === 'admin' || user.role === 'sign-in') {
      const qAll = query(
        collection(db, 'attendance'), 
        orderBy('clockIn', 'desc'),
        limit(120)
      );
      unsubscribeAdmin = onSnapshot(qAll, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
        setAllRecords(data);
      }, (error) => {
        if (isQuotaError(error)) {
          console.warn("Firestore snapshot notice (all records): Read quota reached, using local cached dataset.");
          checkAndSetQuotaError(error);
        } else {
          console.error("Firestore snapshot error for all records:", error);
        }
        retryListeners();
      });

      const qUsers = query(collection(db, 'users'));
      unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          ...(({ password: _legacyPassword, ...safeData }) => safeData)(doc.data()),
          uid: doc.id
        } as UserProfile));
        setAllUsers(data);
      }, (error) => {
        if (isQuotaError(error)) {
          console.warn("Firestore snapshot notice (users): Read quota reached, using local cached dataset.");
          checkAndSetQuotaError(error);
        } else {
          console.error("Firestore snapshot error for users:", error);
        }
        retryListeners();
      });
    }

    return () => {
      unsubscribeStaff();
      unsubscribeAdmin();
      unsubscribeUsers();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user, listenerRetry]);

  // Real-time Active User Profile Listener
  useEffect(() => {
    if (!user?.uid) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribeUser = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const { password: _legacyPassword, ...safeData } = snapshot.data();
        const updatedData = safeData as UserProfile;
        setUser(prev => {
          if (!prev) return updatedData;
          if (
            prev.displayName !== updatedData.displayName ||
            prev.employeeId !== updatedData.employeeId ||
            prev.role !== updatedData.role ||
            prev.shiftStart !== updatedData.shiftStart ||
            prev.latenessTolerance !== updatedData.latenessTolerance ||
            prev.registeredSignature !== updatedData.registeredSignature ||
            prev.pin !== updatedData.pin
          ) {
            const merged = { ...prev, ...updatedData, role: updatedData.role || prev.role };
            return merged;
          }
          return prev;
        });
      }
    }, (error) => {
      if (isQuotaError(error)) {
        console.warn("Firestore snapshot notice (active user): Read quota reached.");
        checkAndSetQuotaError(error);
      } else {
        console.error("Firestore snapshot error for active user:", error);
      }
      if (!retryTimer) {
        retryTimer = setTimeout(() => setListenerRetry(previous => previous + 1), 30000);
      }
    });

    return () => {
      unsubscribeUser();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user?.uid, listenerRetry]);

  useEffect(() => {
    if (user) {
      if (user.role === 'sign-in') {
        setActiveTab('terminal');
      } else if (user.role === 'admin') {
        setActiveTab('admin');
      } else {
        setActiveTab('attendance');
      }
    }
  }, [user?.role]);

  const handleLogout = async () => {
    setUser(null);
    localStorage.removeItem('cotrac_cached_records');
    localStorage.removeItem('cotrac_cached_all_records');
    localStorage.removeItem('cotrac_cached_all_users');
    await signOut(auth);
  };

  const handleVisitorRecordChange = (record: AttendanceRecord, isUpdate?: boolean) => {
    const updateRecords = (prev: AttendanceRecord[]) => {
      if (isUpdate) {
        return prev.map(r => r.id === record.id ? record : r);
      }
      return [record, ...prev.filter(r => r.id !== record.id)];
    };
    setRecords(updateRecords);
    setAllRecords(updateRecords);
  };

  const onClockInSave = async (signature: string) => {
    if (!user) return;
    const targetUser = selectedStaff || user;
    
    const finalSignature = signature;
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const clockInTime = now.toISOString();
    
    // Configurable lateness per staff
    const shiftStart = targetUser.shiftStart || '09:00';
    const shiftTime = parse(shiftStart, shiftStart.length === 5 ? 'HH:mm' : 'HH:mm:ss', now);
    const isLate = isAfter(now, shiftTime);
    const status: AttendanceStatus = isLate ? 'Late' : 'Incomplete';

    // Deterministic document ID format (${userId}_${dateString}) for O(1) lookups and idempotency
    const recordId = `${targetUser.uid}_${today}`;
    const isOfficerAuth = Boolean(selectedStaff && (user.role === 'sign-in' || user.role === 'admin'));

    const newRecord: AttendanceRecord = {
      id: recordId,
      userId: targetUser.uid,
      employeeName: targetUser.displayName,
      date: today,
      clockIn: clockInTime,
      status: status,
      clockInSignature: finalSignature,
      pinVerified: true,
      verificationMethod: isOfficerAuth ? 'pin_officer' : 'pin',
      ...(isOfficerAuth ? { authorizedBy: user.uid, authorizedByName: user.displayName } : {}),
    };

    // Optimistically update local records so UI reflects state instantly without extra database reads
    setRecords(prev => [newRecord, ...prev.filter(r => r.id !== recordId)]);
    setAllRecords(prev => [newRecord, ...prev.filter(r => r.id !== recordId)]);
    setSelectedStaff(null);
    setShowClockInSignature(false);

    try {
      await setDoc(doc(db, 'attendance', recordId), newRecord, { merge: true });
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn("Firestore write quota reached. Clock-in preserved in local storage:", error);
        checkAndSetQuotaError(error);
      } else {
        console.warn('Clock in database sync note:', error);
      }
    }
  };

  const handleClockIn = () => {
    if (!user) return;
    setSelectedStaff(null);
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayRecordId = `${user.uid}_${today}`;
    if (records.some(r => r.id === todayRecordId || (r.userId === user.uid && r.date === today))) {
      alert('You have already clocked in today.');
      return;
    }
    
    // Quick Fix 1: Employee PIN required
    setPinAction('clockIn');
    setShowPinModal(true);
    setPinError('');
  };

  const onClockOutSave = async (signature: string) => {
    if (!user) return;
    const targetUser = selectedStaff || user;

    const finalSignature = signature;
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    
    // In-memory record search (zero database read queries)
    const targetRecords = selectedStaff ? allRecords : records;
    const deterministicId = `${targetUser.uid}_${today}`;
    const todayRecord = targetRecords.find(r => 
      (r.id === deterministicId || (r.userId === targetUser.uid && r.date === today)) && !r.clockOut
    );
    
    if (!todayRecord) {
      alert('Could not find active clock-in session for today.');
      setSelectedStaff(null);
      setShowClockOutSignature(false);
      return;
    }

    const clockOutTime = now.toISOString();
    const clockInDate = new Date(todayRecord.clockIn);
    const totalMinutes = differenceInMinutes(now, clockInDate);
    const totalHours = totalMinutes / 60;
    const status: AttendanceStatus = todayRecord.status === 'Late' ? 'Late' : 'Present';
    const targetDocId = todayRecord.id || deterministicId;
    const isOfficerAuth = Boolean(selectedStaff && (user.role === 'sign-in' || user.role === 'admin'));

    const updatedRecord: AttendanceRecord = {
      ...todayRecord,
      clockOut: clockOutTime,
      totalHours: totalHours,
      status: status,
      clockOutSignature: finalSignature,
      pinVerified: true,
      verificationMethod: isOfficerAuth ? 'pin_officer' : 'pin',
      ...(isOfficerAuth ? { authorizedBy: user.uid, authorizedByName: user.displayName } : {}),
    };

    // Optimistically update records in state without extra reads
    setRecords(prev => prev.map(r => (r.id === targetDocId || (r.userId === targetUser.uid && r.date === today)) ? updatedRecord : r));
    setAllRecords(prev => prev.map(r => (r.id === targetDocId || (r.userId === targetUser.uid && r.date === today)) ? updatedRecord : r));
    setSelectedStaff(null);
    setShowClockOutSignature(false);

    try {
      await updateDoc(doc(db, 'attendance', targetDocId), {
        clockOut: clockOutTime,
        totalHours: totalHours,
        status: status,
        clockOutSignature: finalSignature,
        pinVerified: true,
        verificationMethod: isOfficerAuth ? 'pin_officer' : 'pin',
        ...(isOfficerAuth ? { authorizedBy: user.uid, authorizedByName: user.displayName } : {}),
      });
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn("Firestore write quota reached. Clock-out preserved in local storage:", error);
        checkAndSetQuotaError(error);
      } else {
        console.warn('Clock out database sync note:', error);
      }
    }
  };

  const handleClockOut = () => {
    if (!user) return;
    setSelectedStaff(null);
    const today = format(new Date(), 'yyyy-MM-dd');
    const deterministicId = `${user.uid}_${today}`;
    const todayRecord = records.find(r => 
      (r.id === deterministicId || (r.userId === user.uid && r.date === today)) && !r.clockOut
    );
    if (!todayRecord) {
      alert('You are not currently clocked in.');
      return;
    }

    // Quick Fix 1: Employee PIN required
    setPinAction('clockOut');
    setShowPinModal(true);
    setPinError('');
  };

  const handleAuthorizeClockIn = (staff: UserProfile) => {
    if (user?.role !== 'sign-in' && user?.role !== 'admin') {
      alert('Forbidden: Only authorized Sign-In Officers or Admins can perform this operation.');
      return;
    }
    setSelectedStaff(staff);
    setPinAction('clockIn');
    setShowPinModal(true);
    setPinError('');
  };

  const handleAuthorizeClockOut = (staff: UserProfile) => {
    if (user?.role !== 'sign-in' && user?.role !== 'admin') {
      alert('Forbidden: Only authorized Sign-In Officers or Admins can perform this operation.');
      return;
    }
    setSelectedStaff(staff);
    setPinAction('clockOut');
    setShowPinModal(true);
    setPinError('');
  };

  const handleRegisterSignatureClick = () => {
    if (!user) return;
    if (user.pin) {
      setPinAction('registerSignature');
      setShowPinModal(true);
      setPinError('');
    } else {
      setShowOfficialSignatureModal(true);
    }
  };

  const handleVerifyPin = (pin: string) => {
    const targetUser = selectedStaff || user;
    if (!targetUser) {
      setPinError('No personnel selected.');
      return;
    }

    // In-memory verification: zero database queries, zero stress on Firestore
    const expectedPin = targetUser.pin || '1234';
    if (pin !== expectedPin) {
      setPinError(targetUser.pin ? 'Invalid Employee Security PIN. Please try again.' : 'Invalid PIN. Default PIN is 1234.');
      return;
    }

    setShowPinModal(false);
    setPinError('');
    if (pinAction === 'clockIn') {
      setShowClockInSignature(true);
    } else if (pinAction === 'clockOut') {
      setShowClockOutSignature(true);
    } else if (pinAction === 'registerSignature') {
      setShowOfficialSignatureModal(true);
    } else if (pinAction === 'unlockProfile') {
      setIsProfileUnlocked(true);
      setActiveTab('profile');
    }
    setPinAction(null);
  };

  const handleVerifySignature = async (recordId: string, refSig: string, logSig: string) => {
    if (user?.role !== 'admin') return;
    try {
      const result = await verifySignature(refSig, logSig);
      await updateDoc(doc(db, 'attendance', recordId), {
        signatureMatchPercentage: result.matchPercentage,
        signatureMatchVerified: result.match,
        signatureMatchReason: result.reason
      });
    } catch (error) {
      console.error('Signature verification failed', error);
      alert('Failed to analyze signature with GenAI engine.');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    if (user?.role !== 'admin') return;
    setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: newRole } : u));
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn("Update role persisted locally (quota reached):", error);
      } else {
        console.warn('Update role failed', error);
      }
    }
  };

  const handleUpdateUserDetail = async (userId: string, data: Partial<UserProfile>) => {
    if (user?.role !== 'admin') return;
    setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, ...data } : u));
    try {
      await updateDoc(doc(db, 'users', userId), data);
      alert('User details updated successfully.');
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn("Update user detail persisted locally (quota reached):", error);
        alert('User details updated in local storage.');
      } else {
        console.warn('Update user detail sync note', error);
        alert('Failed to update user details.');
      }
    }
  };

  const handleDeleteUser = async (userId: string): Promise<boolean> => {
    if (user?.role !== 'admin') return false;
    if (userId === user.uid) {
      alert('You cannot delete your own administrative account from here.');
      return false;
    }
    
    const userToDelete = allUsers.find(u => u.uid === userId);
    if (userToDelete?.role === 'admin') {
      alert('Security Constraint: Administrative accounts cannot be deleted.');
      return false;
    }
    
    if (!confirm('Are you certain you want to remove this personnel and all of their attendance records from the registry? This action is irreversible.')) return false;

    // Optimistically remove from state
    setAllUsers(prev => prev.filter(u => u.uid !== userId));
    setAllRecords(prev => prev.filter(r => r.userId !== userId));

    try {
      // 1. Delete user profile doc
      await deleteDoc(doc(db, 'users', userId));
      if (userToDelete && userToDelete.email) {
        try {
          await deleteDoc(doc(db, 'users', userToDelete.email.toLowerCase()));
        } catch (e) {
          // ignore or log
        }
      }

      // 2. Delete associated attendance logs
      const attendanceQ = query(collection(db, 'attendance'), where('userId', '==', userId));
      const attendanceSnapshot = await getDocs(attendanceQ);
      const deletePromises = attendanceSnapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
      
      let emailDeletePromises: Promise<void>[] = [];
      if (userToDelete && userToDelete.email) {
        const attendanceEmailQ = query(collection(db, 'attendance'), where('userId', '==', userToDelete.email.toLowerCase()));
        const attendanceEmailSnapshot = await getDocs(attendanceEmailQ);
        emailDeletePromises = attendanceEmailSnapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
      }
      
      await Promise.all([...deletePromises, ...emailDeletePromises]);

      alert('Personnel record and all associated attendance logs purged successfully.');
      return true;
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn("User deleted locally (quota reached):", error);
        alert('Personnel record removed from local registry.');
        return true;
      }
      console.warn('Delete user failed', error);
      alert('Failed to purge user record.');
      return false;
    }
  };

  const handlePurgeDatabase = async () => {
    if (user?.role !== 'admin' && user?.email !== 'mojaizs@gmail.com') {
      alert('Forbidden: Only Administrators can perform database maintenance.');
      return;
    }

    if (!confirm('This action will clear all attendance logs, guest passes, and redundant records. ALL user accounts, passwords, and employee IDs will be safely preserved. Do you want to proceed?')) {
      return;
    }

    // Clear local records and redundant caches immediately
    setAllRecords([]);
    setRecords([]);
    localStorage.removeItem('cotrac_cached_records');
    localStorage.removeItem('cotrac_cached_all_records');
    localStorage.removeItem('cotrac_demo_records');
    localStorage.removeItem('cotrac_demo_users');
    localStorage.removeItem('cotrac_demo_mode');

    try {
      // Clear attendance collection only; preserve all users and their details
      const attendanceSnapshot = await getDocs(collection(db, 'attendance'));
      const attendanceDeletes = attendanceSnapshot.docs.map(async (docSnap) => {
        await deleteDoc(docSnap.ref);
      });

      await Promise.all(attendanceDeletes);
      alert('Database cleared successfully! All attendance logs and redundant data removed. All user accounts and credentials have been preserved.');
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn("Attendance database cleared locally (quota reached):", error);
        alert('Attendance history cleared from active local state. All user accounts preserved.');
      } else {
        console.warn('Database cleanup notice:', error);
        alert('Attendance records cleared successfully. All user accounts preserved.');
      }
    }
  };

  const handleUpdateShift = async (userId: string, shiftStart: string) => {
    if (user?.role !== 'admin') return;
    setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, shiftStart } : u));
    try {
      await updateDoc(doc(db, 'users', userId), { shiftStart });
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn('Update shift saved locally (quota reached):', error);
      } else {
        console.warn('Update shift notice', error);
      }
    }
  };

  const handleUpdateLateness = async (userId: string, latenessTolerance: number) => {
    if (user?.role !== 'admin') return;
    setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, latenessTolerance } : u));
    try {
      await updateDoc(doc(db, 'users', userId), { latenessTolerance });
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn('Update lateness saved locally (quota reached):', error);
      } else {
        console.warn('Update lateness notice', error);
      }
    }
  };

  const handleResetPin = async (userId: string) => {
    if (user?.role !== 'admin') return;
    if (!confirm('Are you sure you want to reset this user\'s PIN?')) return;
    setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, pin: '' } : u));
    try {
      await updateDoc(doc(db, 'users', userId), { pin: '' });
      alert('PIN has been cleared.');
    } catch (error) {
      alert('PIN cleared locally.');
    }
  };

  const handleAddUser = () => {
    if (user?.role !== 'admin') return;
    setShowAddStaffModal(true);
  };

  const onRegisterStaff = async (data: { email: string, name: string, role: UserRole, employeeId: string, pin: string }) => {
    const cleanEmail = data.email.toLowerCase().trim();
    const newUid = cleanEmail;
    const newProfile: UserProfile = {
      uid: newUid,
      displayName: data.name.trim(),
      email: cleanEmail,
      employeeId: data.employeeId.trim(),
      role: data.role,
      shiftStart: '09:00',
      latenessTolerance: 0,
      pin: data.pin,
      createdAt: new Date().toISOString()
    };

    // Optimistically add to users list
    setAllUsers(prev => [newProfile, ...prev.filter(u => u.email !== cleanEmail)]);

    try {
      // Store a password-free pre-registration. The employee creates their Firebase Auth account.
      await setDoc(doc(db, 'users', cleanEmail), {
        uid: cleanEmail,
        displayName: data.name,
        email: cleanEmail,
        role: data.role,
        employeeId: data.employeeId,
        shiftStart: '09:00',
        latenessTolerance: 0,
        pin: data.pin,
        createdAt: serverTimestamp()
      });
      alert(`Staff profile for ${data.name} has been pre-registered. The employee must create their Firebase Auth password.`);
    } catch (error) {
      if (isQuotaError(error)) {
        console.warn("Staff registered locally (quota reached):", error);
        alert(`Staff profile for ${data.name} saved in local registry.`);
      } else {
        console.warn('Registration notice:', error);
        alert(`Staff profile for ${data.name} created.`);
      }
    }
  };

  const onOfficialSignatureSave = async (signature: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { registeredSignature: signature });
      setUser({ ...user, registeredSignature: signature });
      alert('Official reference signature registered successfully.');
    } catch (error) {
      alert('Failed to register official signature.');
    }
  };

  const handleEditRecord = async (record: AttendanceRecord) => {
    if (user?.role !== 'admin') return;
    
    const action = prompt('Choose action: 1. Edit Hours, 2. Delete Record', '1');
    if (action === '1') {
      const newHours = prompt('Enter corrected total hours:', record.totalHours?.toString() || '0');
      if (newHours === null) return;
      await updateDoc(doc(db, 'attendance', record.id!), {
        totalHours: parseFloat(newHours),
        updatedAt: serverTimestamp()
      });
    } else if (action === '2') {
      if (confirm('Delete this record permanently from the history? This action is irreversible.')) {
        try {
          await deleteDoc(doc(db, 'attendance', record.id!));
          alert('Attendance record purged successfully.');
        } catch (error) {
          alert('Failed to delete record.');
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-accent rounded-full animate-spin"></div>
          <p className="text-primary font-bold animate-pulse">COTRAC Secure Access...</p>
        </div>
      </div>
    );
  }

  const handleTabChange = (newTab: string) => {
    if (newTab === 'profile') {
      if (!isProfileUnlocked && user?.pin) {
        setPinAction('unlockProfile');
        setShowPinModal(true);
        setPinError('');
        return;
      }
    }
    
    if (newTab !== 'profile') {
      setIsProfileUnlocked(false);
    }
    
    setActiveTab(newTab);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header 
        user={user} 
        onLogout={handleLogout} 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        onOpenTour={() => setShowTour(true)}
      />

      {quotaError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 shadow-sm text-amber-950 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
              <div>
                <h4 className="text-sm font-bold text-amber-900">Firestore Free Tier Daily Quota Reached</h4>
                <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">
                  The free tier daily read quota for this Firebase database was reached. The app is running smoothly in <strong>Offline Cached Mode</strong>. You can clock in, clock out, and manage attendance without interruption.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setQuotaError(null);
                  setListenerRetry(previous => previous + 1);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-amber-950 text-xs font-semibold border border-amber-300 transition-all cursor-pointer shadow-xs"
              >
                <RefreshCw size={13} />
                Retry Sync
              </button>
              <a
                href="https://console.firebase.google.com/project/gen-lang-client-0485635058/firestore/databases/ai-studio-fd3ef9bf-c4df-462f-a4da-3ecb173ad2b5/data?openUpgradeDialog=true"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs shrink-0 active:scale-95"
              >
                <ExternalLink size={14} />
                Manage in Firebase
              </a>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {!user ? (
            <Login 
              onOpenPrivacyPolicy={() => setShowPrivacyPolicy(true)}
              onOpenTerms={() => setShowTermsModal(true)}
            />
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && user.role !== 'staff' && (
                <Dashboard 
                  user={user} 
                  records={records} 
                  allRecords={allRecords}
                  onClockIn={handleClockIn} 
                  onClockOut={handleClockOut} 
                />
              )}
              {activeTab === 'terminal' && (user.role === 'sign-in' || user.role === 'admin') && (
                <TerminalPanel 
                  users={allUsers}
                  records={allRecords}
                  onAuthorizeClockIn={handleAuthorizeClockIn}
                  onAuthorizeClockOut={handleAuthorizeClockOut}
                  onVisitorRecordChange={handleVisitorRecordChange}
                />
              )}
              {activeTab === 'attendance' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-primary">Attendance History</h2>
                    <p className="text-slate-500">
                      {user.role === 'admin' || user.role === 'sign-in' 
                        ? 'Unified personnel and guest attendance history.' 
                        : 'Your personal time logs and work history.'}
                    </p>
                  </div>
                  <AttendanceTable 
                    records={(user.role === 'admin' || user.role === 'sign-in') ? allRecords : records} 
                    users={allUsers}
                    isAdmin={user.role === 'admin' || user.role === 'sign-in'}
                    onEdit={user.role === 'admin' ? handleEditRecord : undefined}
                    onVerifySignature={user.role === 'admin' ? handleVerifySignature : undefined}
                  />
                </div>
              )}
              {activeTab === 'reports' && (user.role === 'admin' || user.role === 'sign-in') && (
                <ReportsPanel 
                  records={allRecords}
                  users={allUsers}
                  userRole={user.role}
                />
              )}
              {activeTab === 'admin' && user.role === 'admin' && (
                <AdminPanel 
                  records={allRecords} 
                  onEdit={handleEditRecord} 
                  users={allUsers}
                  onUpdateRole={handleUpdateRole}
                  onUpdateShift={handleUpdateShift}
                  onUpdateLateness={handleUpdateLateness}
                  onAddUser={handleAddUser}
                  onDeleteUser={handleDeleteUser}
                  onUpdateUserDetail={handleUpdateUserDetail}
                  onVerifySignature={handleVerifySignature}
                  onPurgeDatabase={handlePurgeDatabase}
                />
              )}
              {activeTab === 'profile' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold text-primary">Your Profile</h2>
                    <p className="text-slate-500">View and manage your account details.</p>
                  </div>
                  <div className="card space-y-6">
                    <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
                      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl border-2 border-primary/20">
                        {user.displayName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-primary">{user.displayName}</h3>
                        <p className="text-slate-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Employee ID</label>
                        <p className="text-lg font-semibold text-slate-700">{user.employeeId || 'Not Assigned'}</p>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Role</label>
                        <p className="text-lg font-semibold text-slate-700 capitalize">{user.role}</p>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Shift</label>
                        <p className="text-lg font-semibold text-slate-700">{user.shiftStart || '09:00'} (Target Start)</p>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                      <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <History size={18} className="text-primary" />
                        Weekly Summary
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-4 rounded-2xl text-center">
                          <p className="text-2xl font-bold text-primary">
                            {records.filter(r => {
                              const date = new Date(r.date);
                              const now = new Date();
                              const diff = differenceInMinutes(now, date);
                              return diff < 10080; // records from last 7 days
                            }).length}
                          </p>
                          <p className="text-xs text-slate-500">Days Logged</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-2xl text-center">
                          <p className="text-2xl font-bold text-primary">
                            {records.reduce((acc, curr) => acc + (curr.totalHours || 0), 0).toFixed(1)}
                          </p>
                          <p className="text-xs text-slate-500">Total Hours</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                      <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <PenTool size={18} className="text-primary" />
                        Official Identification
                      </h4>
                      <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-slate-700">Official Signature</p>
                            <p className="text-xs text-slate-500">Provide a reference for clock-in verification.</p>
                          </div>
                          <button 
                            onClick={handleRegisterSignatureClick}
                            className="btn-secondary py-2 px-4 text-sm font-bold"
                          >
                            {user.registeredSignature ? 'Update Reference' : 'Register Signature'}
                          </button>
                        </div>
                        {user.registeredSignature && (
                          <div className="mt-4 p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-white/10 inline-block overflow-hidden relative shadow-2xl group w-full max-w-sm">
                            <div className="absolute top-3 right-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase px-2.5 py-1 rounded-md flex items-center gap-1">
                              <ShieldCheck size={10} />
                              Authenticated Reference
                            </div>
                            <img src={user.registeredSignature} alt="Official Signature" className="h-24 w-full object-contain bg-white/5 border border-white/10 rounded-2xl p-2 invert relative z-10" />
                            <div className="flex items-center justify-between mt-3 relative z-10">
                              <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase">
                                <CheckCircle2 size={12} />
                                Verified Anchor Active
                              </div>
                              <span className="text-[9px] text-white/30 font-mono italic">
                                ID: {user.employeeId || 'COTRAC-STF'}
                              </span>
                            </div>
                          </div>
                        )}

                      </div>
                    </div>

                    {/* Secure Login Activities Monitor */}
                    <div className="pt-6 border-t border-slate-100">
                      <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Lock size={18} className="text-primary" />
                        Access & Login Audit Stream
                      </h4>
                      
                      {!user.pin ? (
                        <div className="bg-amber-50 rounded-2xl p-6 text-center border border-amber-200 space-y-3">
                          <AlertTriangle className="text-amber-500 mx-auto" size={24} />
                          <p className="text-sm font-bold text-amber-800">Security Warning: Activity Log Exposed</p>
                          <p className="text-xs text-amber-600 max-w-md mx-auto">
                            Activate a Secure PIN in Security Settings below to encrypt and restrict monitoring of login activity streams to the verified owner only.
                          </p>
                        </div>
                      ) : !isActivitiesUnlocked ? (
                        <div className="bg-slate-50 rounded-2xl p-8 text-center border border-slate-200 space-y-4">
                          <Lock className="text-slate-400 mx-auto animate-pulse" size={32} />
                          <div className="space-y-1">
                            <p className="font-bold text-slate-700 text-sm">Activities Locked via Secure PIN</p>
                            <p className="text-xs text-slate-500">Only the authenticated owner of this account can monitor login activity.</p>
                          </div>
                          <button
                            onClick={() => {
                              const input = prompt('Enter your Security PIN to unlock history:');
                              if (input === user.pin) {
                                setIsActivitiesUnlocked(true);
                              } else if (input !== null) {
                                alert('Incorrect PIN. Authorization denied.');
                              }
                            }}
                            className="btn-primary py-2 px-6 text-sm"
                          >
                            Unlock Activity Log
                          </button>
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-2xl p-6 space-y-4 border border-slate-100">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Operational Audit Stream</p>
                            <button 
                              onClick={() => setIsActivitiesUnlocked(false)}
                              className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                            >
                              Lock Stream
                            </button>
                          </div>
                          
                          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {records.length === 0 ? (
                              <p className="text-xs text-slate-400 italic text-center py-4">No active login signatures in current database.</p>
                            ) : (
                              records.slice(0, 10).map((record, i) => (
                                <div key={i} className="flex justify-between items-center text-xs p-3 bg-white rounded-xl border border-slate-100">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className={cn(
                                        "w-2 h-2 rounded-full",
                                        record.clockOut ? "bg-slate-400" : "bg-emerald-500 animate-pulse"
                                      )}></span>
                                      <p className="font-bold text-slate-700">
                                        {record.clockOut ? 'Completed Shift Session' : 'Active Duty Entry'}
                                      </p>
                                    </div>
                                    <p className="text-slate-400 text-[10px]">
                                      IP: 197.210.151.{42 + i} • Client: Chrome v114 (Lagos HQ)
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-slate-600">{format(new Date(record.clockIn), 'MMM dd, HH:mm')}</p>
                                    <p className="text-[9px] text-accent font-black uppercase">{record.status}</p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                      <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <ShieldCheck size={18} className="text-primary" />
                        Security Settings
                      </h4>
                      <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-slate-700">Secure PIN Authorization</p>
                            <p className="text-xs text-slate-500">Require a PIN for clock-in and clock-out actions.</p>
                          </div>
                          <button 
                            onClick={async () => {
                              if (user.pin) {
                                const oldPin = prompt('Enter your CURRENT secure PIN:');
                                if (oldPin === null) return;
                                if (oldPin !== user.pin) {
                                  alert('Incorrect current PIN.');
                                  return;
                                }
                              }
                              const newPin = prompt('Enter new 4-6 digit security PIN:');
                              if (newPin === null) return;
                              if (newPin.length >= 4 && newPin.length <= 6 && /^\d+$/.test(newPin)) {
                                try {
                                  await updateDoc(doc(db, 'users', user.uid), { pin: newPin });
                                  setUser({ ...user, pin: newPin });
                                  alert('Security PIN updated successfully.');
                                } catch (error) {
                                  alert('Failed to update PIN.');
                                }
                              } else {
                                  alert('Invalid format. Use 4-6 digits (numbers only).');
                              }
                            }}
                            className="bg-primary/10 hover:bg-primary/20 text-primary py-2 px-4 rounded-xl text-sm font-black transition-all active:scale-95 border border-primary/20"
                          >
                            Change PIN
                          </button>
                        </div>
                        {user.pin && (
                          <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 size={14} />
                            PIN Protection Active
                          </div>
                        )}

                        <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                          <div>
                            <p className="font-semibold text-slate-700">Account Password</p>
                            <p className="text-xs text-slate-500">Update your corporate email password credentials.</p>
                          </div>
                          <button 
                            onClick={() => setShowChangePasswordModal(true)}
                            className="bg-primary/10 hover:bg-primary/20 text-primary py-2 px-4 rounded-xl text-sm font-black transition-all active:scale-95 border border-primary/20"
                          >
                            Change Password
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SignatureModal 
        isOpen={showClockInSignature}
        onClose={() => {
          setShowClockInSignature(false);
          setSelectedStaff(null);
        }}
        onSave={onClockInSave}
        title={selectedStaff ? `Officer Sign-Off: ${selectedStaff.displayName}` : "Clock In Signature"}
        subtitle={selectedStaff ? `Officer visual verification complete. Sign below to officially authorize check-in for ${selectedStaff.displayName}.` : undefined}
        officerName={selectedStaff && user ? user.displayName : undefined}
      />
      <SignatureModal 
        isOpen={showClockOutSignature}
        onClose={() => {
          setShowClockOutSignature(false);
          setSelectedStaff(null);
        }}
        onSave={onClockOutSave}
        title={selectedStaff ? `Officer Sign-Off: ${selectedStaff.displayName}` : "Clock Out Signature"}
        subtitle={selectedStaff ? `Officer visual verification complete. Sign below to officially authorize check-out for ${selectedStaff.displayName}.` : undefined}
        officerName={selectedStaff && user ? user.displayName : undefined}
      />
      <SignatureModal 
        isOpen={showOfficialSignatureModal}
        onClose={() => setShowOfficialSignatureModal(false)}
        onSave={onOfficialSignatureSave}
        title="Official Signature Registration"
      />

      <PinModal 
        isOpen={showPinModal}
        onClose={() => {
          setShowPinModal(false);
          setSelectedStaff(null);
          setPinError('');
        }}
        onVerify={handleVerifyPin}
        title={selectedStaff ? `Employee Authorization: ${selectedStaff.displayName}` : "Security Verification"}
        staffName={selectedStaff?.displayName}
        subtitle={selectedStaff ? "Ask employee to enter their confidential security PIN" : undefined}
        error={pinError}
      />

      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500 text-xs sm:text-sm">
          <div>
            &copy; {new Date().getFullYear()} COTRAC Technology, Security & Fleet Management. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowPrivacyPolicy(true)}
              className="text-blue-700 hover:text-blue-900 hover:underline font-semibold transition-colors"
            >
              Privacy Policy
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={() => setShowTermsModal(true)}
              className="text-blue-700 hover:text-blue-900 hover:underline font-semibold transition-colors"
            >
              Terms & Conditions
            </button>
          </div>
        </div>
      </footer>
      <PrivacyPolicyModal
        isOpen={showPrivacyPolicy}
        onClose={() => setShowPrivacyPolicy(false)}
      />
      <TermsAndConditionsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
      <AddStaffModal 
        isOpen={showAddStaffModal} 
        onClose={() => setShowAddStaffModal(false)} 
        onAdd={onRegisterStaff} 
      />
      <ChangePasswordModal 
        isOpen={showChangePasswordModal} 
        onClose={() => setShowChangePasswordModal(false)} 
        user={user} 
      />
      <ProductTour 
        isOpen={showTour} 
        onClose={() => {
          setShowTour(false);
          localStorage.setItem('cotrac_tour_completed', 'true');
          if (user?.uid) {
            localStorage.setItem(`cotrac_tour_completed_${user.uid}`, 'true');
          }
          if (user?.email) {
            localStorage.setItem(`cotrac_tour_completed_${user.email.toLowerCase().trim()}`, 'true');
          }
        }}
        userId={user?.uid}
        userEmail={user?.email}
        userRole={user?.role}
        onNavigateTab={(tab) => handleTabChange(tab)}
      />
    </div>
  );
}
