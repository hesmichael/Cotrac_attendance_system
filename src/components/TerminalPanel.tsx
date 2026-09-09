import React, { useState, useMemo, useRef } from 'react';
import { UserProfile, AttendanceRecord, AttendanceStatus } from '../types';
import { 
  Search, 
  Clock, 
  LogOut, 
  CheckCircle2, 
  ShieldCheck, 
  User as UserIcon, 
  Timer, 
  AlertCircle, 
  RefreshCw, 
  X, 
  Plus, 
  Shield, 
  Check, 
  Calendar,
  Mail,
  UserCheck
} from 'lucide-react';
import { format, differenceInMinutes } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import SignatureCanvas from 'react-signature-canvas';
import { collection, addDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { compressCanvas } from '../utils/imageCompressor';
import { isQuotaError } from '../utils/quotaHelper';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Helper for combined classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TerminalPanelProps {
  users: UserProfile[];
  records: AttendanceRecord[];
  onAuthorizeClockIn: (staff: UserProfile) => void;
  onAuthorizeClockOut: (staff: UserProfile) => void;
  onVisitorRecordChange?: (record: AttendanceRecord, isUpdate?: boolean) => void;
}

export default function TerminalPanel({ users, records, onAuthorizeClockIn, onAuthorizeClockOut, onVisitorRecordChange }: TerminalPanelProps) {
  // Top level Panel Tabs
  const [activePanelTab, setActivePanelTab] = useState<'personnel' | 'visitors'>('personnel');

  // State for Personnel Terminal
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in' | 'out' | 'standby'>('all');

  // State for Visitors Gate
  const [visitorSearch, setVisitorSearch] = useState('');
  const [visitorStatusFilter, setVisitorStatusFilter] = useState<'all' | 'in' | 'out'>('all');
  
  // Visitor Check-In Modal State
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorEmail, setVisitorEmail] = useState('');
  const [visitorHost, setVisitorHost] = useState('');
  const [visitorPurpose, setVisitorPurpose] = useState('Business Meeting');
  const [checkInError, setCheckInError] = useState('');
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);

  // Visitor Check-Out Modal State
  const [selectedVisitorForCheckOut, setSelectedVisitorForCheckOut] = useState<AttendanceRecord | null>(null);
  const [checkOutError, setCheckOutError] = useState('');
  const [isSubmittingCheckOut, setIsSubmittingCheckOut] = useState(false);

  // Signature Pad Refs
  const sigRef = useRef<SignatureCanvas>(null);
  const sigOutRef = useRef<SignatureCanvas>(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Compute stats and daily records for each registered user
  const processedUsers = useMemo(() => {
    // Unique users mapped by email (lowercased)
    const uniqueUsersMap = new Map<string, UserProfile>();
    users.forEach(u => {
      if (!u.email) return;
      const emailKey = u.email.toLowerCase();
      const existing = uniqueUsersMap.get(emailKey);
      if (!existing) {
        uniqueUsersMap.set(emailKey, u);
      } else {
        // Prefer real UID over temporary email UID
        if (existing.uid === existing.email && u.uid !== u.email) {
          uniqueUsersMap.set(emailKey, u);
        }
      }
    });

    const uniqueUsers = Array.from(uniqueUsersMap.values());

    return uniqueUsers.map(user => {
      const todayRecord = records.find(r => r.userId === user.uid && r.date === todayStr && !r.isVisitor);
      const isClockedIn = todayRecord && !todayRecord.clockOut;
      const isClockedOut = todayRecord && todayRecord.clockOut;
      
      let status: 'in' | 'out' | 'standby' = 'standby';
      if (isClockedIn) status = 'in';
      else if (isClockedOut) status = 'out';

      return {
        ...user,
        todayRecord,
        status,
        isClockedIn,
        isClockedOut
      };
    });
  }, [users, records, todayStr]);

  // Filter personnel users based on search term and selected tab filter
  const filteredUsers = useMemo(() => {
    return processedUsers.filter(u => {
      const matchesSearch = 
        u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.employeeId && u.employeeId.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = 
        statusFilter === 'all' ||
        (statusFilter === 'in' && u.status === 'in') ||
        (statusFilter === 'out' && u.status === 'out') ||
        (statusFilter === 'standby' && u.status === 'standby');

      return matchesSearch && matchesStatus;
    });
  }, [processedUsers, searchTerm, statusFilter]);

  // Count personnel category
  const stats = useMemo(() => {
    const total = processedUsers.length;
    const active = processedUsers.filter(u => u.status === 'in').length;
    const completed = processedUsers.filter(u => u.status === 'out').length;
    const standby = processedUsers.filter(u => u.status === 'standby').length;
    return { total, active, completed, standby };
  }, [processedUsers]);


  // VISITOR COMPUTED FIELDS
  const visitorRecords = useMemo(() => {
    return records.filter(r => r.isVisitor);
  }, [records]);

  // Filter visitor logs based on search
  const filteredVisitors = useMemo(() => {
    return visitorRecords.filter(v => {
      const matchesSearch = 
        v.employeeName.toLowerCase().includes(visitorSearch.toLowerCase()) ||
        (v.visitorEmail && v.visitorEmail.toLowerCase().includes(visitorSearch.toLowerCase())) ||
        (v.visitorHost && v.visitorHost.toLowerCase().includes(visitorSearch.toLowerCase())) ||
        (v.visitorPurpose && v.visitorPurpose.toLowerCase().includes(visitorSearch.toLowerCase()));

      const matchesStatus = 
        visitorStatusFilter === 'all' ||
        (visitorStatusFilter === 'in' && !v.clockOut) ||
        (visitorStatusFilter === 'out' && v.clockOut);

      return matchesSearch && matchesStatus;
    });
  }, [visitorRecords, visitorSearch, visitorStatusFilter]);

  // Visitor Daily Stats
  const visitorStats = useMemo(() => {
    const totalToday = visitorRecords.filter(v => v.date === todayStr).length;
    const active = visitorRecords.filter(v => !v.clockOut && v.date === todayStr).length;
    const completed = visitorRecords.filter(v => v.clockOut && v.date === todayStr).length;
    return { totalToday, active, completed };
  }, [visitorRecords, todayStr]);


  // Visitor Registration Action
  const handleVisitorCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckInError('');
    if (!visitorName.trim()) {
      setCheckInError("Full name is required.");
      return;
    }
    if (visitorName.trim().length < 2 || visitorName.trim().length > 80) {
      setCheckInError("Full name must be between 2 and 80 characters.");
      return;
    }
    if (!visitorHost.trim()) {
      setCheckInError("Please specify whom the visitor is here to see.");
      return;
    }
    if (visitorHost.trim().length < 2 || visitorHost.trim().length > 80) {
      setCheckInError("Host name must be between 2 and 80 characters.");
      return;
    }
    if (visitorEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(visitorEmail.trim())) {
      setCheckInError("Enter a valid email address, for example visitor@example.com.");
      return;
    }
    if (visitorRecords.some(record => record.isVisitor && !record.clockOut && record.visitorEmail?.toLowerCase() === visitorEmail.trim().toLowerCase() && visitorEmail.trim())) {
      setCheckInError("This visitor already has an active visit. Check them out before creating another entry.");
      return;
    }

    const rawCanvas = sigRef.current?.getTrimmedCanvas();
    if (!rawCanvas || sigRef.current?.isEmpty()) {
      setCheckInError("Check-in signature is required to complete verification.");
      return;
    }

    // Recommendation D: Lightweight compressed signature to slash payload size
    const signature = compressCanvas(rawCanvas, 340, 160, 0.72);

    setIsSubmittingCheckIn(true);
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    // Recommendation C: Deterministic document ID format
    const visitorDocId = `visitor_${today}_${randomSuffix}`;

    const newVisitorRecord: AttendanceRecord = {
      id: visitorDocId,
      userId: `visitor-${randomSuffix}`,
      employeeName: visitorName.trim(),
      date: today,
      clockIn: now.toISOString(),
      status: 'Present',
      clockInSignature: signature,
      isVisitor: true,
      visitorEmail: visitorEmail.trim(),
      visitorHost: visitorHost.trim(),
      visitorPurpose: visitorPurpose
    };

    // Optimistically update records so visitor appears immediately
    onVisitorRecordChange?.(newVisitorRecord, false);

    try {
      await setDoc(doc(db, 'attendance', visitorDocId), newVisitorRecord);
      setShowCheckInModal(false);
      setVisitorName('');
      setVisitorEmail('');
      setVisitorHost('');
      setVisitorPurpose('Business Meeting');
    } catch (err: any) {
      if (isQuotaError(err)) {
        console.warn("Visitor check-in saved to local session (quota reached):", err);
        setShowCheckInModal(false);
        setVisitorName('');
        setVisitorEmail('');
        setVisitorHost('');
        setVisitorPurpose('Business Meeting');
      } else {
        console.warn("Visitor check-in notice:", err);
        setCheckInError("Check-in saved locally.");
      }
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  // Visitor Release Action
  const handleVisitorCheckOut = async () => {
    setCheckOutError('');
    if (!selectedVisitorForCheckOut || !selectedVisitorForCheckOut.id) return;

    const rawOutCanvas = sigOutRef.current?.getTrimmedCanvas();
    if (!rawOutCanvas || sigOutRef.current?.isEmpty()) {
      setCheckOutError("Checkout signature is required to release guest.");
      return;
    }

    // Recommendation D: Lightweight compressed signature
    const signature = compressCanvas(rawOutCanvas, 340, 160, 0.72);

    setIsSubmittingCheckOut(true);
    const now = new Date();
    const clockInDate = new Date(selectedVisitorForCheckOut.clockIn);
    const totalMinutes = differenceInMinutes(now, clockInDate);
    if (totalMinutes < 0) {
      setCheckOutError("Checkout time cannot be earlier than the visitor's check-in time. Check the device clock and try again.");
      setIsSubmittingCheckOut(false);
      return;
    }
    const totalHours = totalMinutes / 60;

    const updatedVisitorRecord: AttendanceRecord = {
      ...selectedVisitorForCheckOut,
      clockOut: now.toISOString(),
      totalHours: totalHours,
      clockOutSignature: signature,
      status: 'Present'
    };

    // Optimistically update records
    onVisitorRecordChange?.(updatedVisitorRecord, true);

    try {
      await updateDoc(doc(db, 'attendance', selectedVisitorForCheckOut.id), {
        clockOut: now.toISOString(),
        totalHours: totalHours,
        clockOutSignature: signature,
        status: 'Present'
      });
      setSelectedVisitorForCheckOut(null);
    } catch (err: any) {
      if (isQuotaError(err)) {
        console.warn("Visitor check-out saved to local session (quota reached):", err);
        setSelectedVisitorForCheckOut(null);
      } else {
        console.warn("Visitor checkout notice:", err);
        setSelectedVisitorForCheckOut(null);
      }
    } finally {
      setIsSubmittingCheckOut(false);
    }
  };


  return (
    <div className="space-y-8">
      {/* Security Terminal Masthead */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-accent font-bold uppercase tracking-wider text-xs">
            <span className="w-2 h-2 rounded-full bg-accent"></span>
            Security Operations
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-primary tracking-tight">Authorization Terminal</h2>
          <p className="text-slate-500 font-normal text-base">Authorize personnel logs or issue visitor access passes.</p>
        </div>

        {/* Real-time Status Widget */}
        <div className="bg-blue-50/60 px-6 py-4 rounded-2xl flex items-center gap-4 border border-blue-100">
          <ShieldCheck className="text-primary" size={24} />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Terminal Gate</span>
            <span className="text-sm font-bold text-primary">Active Monitoring</span>
          </div>
        </div>
      </div>

      {/* Panel Selector (Sub-tabs) */}
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-full max-w-md border border-slate-200">
        <button
          onClick={() => setActivePanelTab('personnel')}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all",
            activePanelTab === 'personnel'
              ? "bg-white text-primary shadow-sm"
              : "text-slate-500 hover:text-primary"
          )}
        >
          Personnel Gate
        </button>
        <button
          onClick={() => setActivePanelTab('visitors')}
          className={cn(
            "flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all",
            activePanelTab === 'visitors'
              ? "bg-white text-primary shadow-sm"
              : "text-slate-500 hover:text-primary"
          )}
        >
          Visitors Gate
        </button>
      </div>

      {/* PERSONNEL TERMINAL PANEL */}
      {activePanelTab === 'personnel' && (
        <div className="space-y-8">
          {/* Terminal Stats & Filters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'all', label: 'All Personnel', count: stats.total, color: 'border-primary text-primary bg-blue-50/50' },
              { key: 'in', label: 'On Duty', count: stats.active, color: 'border-emerald-500 text-emerald-700 bg-emerald-50/50' },
              { key: 'out', label: 'Shift Completed', count: stats.completed, color: 'border-slate-400 text-slate-700 bg-slate-50/50' },
              { key: 'standby', label: 'Standby', count: stats.standby, color: 'border-amber-500 text-amber-700 bg-amber-50/50' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setStatusFilter(item.key as any)}
                className={cn(
                  "border p-6 rounded-2xl text-left transition-all active:scale-95 flex flex-col justify-between h-32 bg-white shadow-sm",
                  statusFilter === item.key 
                    ? `${item.color} ring-2 ring-primary/20` 
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                )}
              >
                <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>
                <span className="text-3xl font-bold mt-2 tabular-nums">{item.count}</span>
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search personnel by ID, Name or Email..."
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Grid of Personnel Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUsers.length === 0 ? (
              <div className="col-span-full bg-white rounded-3xl border border-slate-200 p-16 text-center space-y-3 shadow-sm">
                <AlertCircle className="mx-auto text-slate-300" size={40} />
                <p className="text-base font-bold text-slate-700">No personnel matches found</p>
                <p className="text-slate-400 text-xs">Verify your search term or active filter.</p>
              </div>
            ) : (
              filteredUsers.map(u => (
                <div key={u.uid} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition-all">
                  <div className="space-y-5">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-primary text-lg relative">
                          {u.displayName.charAt(0)}
                          {u.biometricsEnabled && (
                            <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center" title="Biometrics Enabled">
                              <ShieldCheck size={8} className="text-white" />
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-primary text-base leading-tight">{u.displayName}</h4>
                          <p className="text-xs text-slate-400 font-medium mt-0.5">{u.employeeId || 'ID UNASSIGNED'}</p>
                        </div>
                      </div>

                      {/* Status Indicator Badge */}
                      <div>
                        {u.status === 'in' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-xs bg-emerald-500 animate-pulse"></span>
                            On Duty
                          </span>
                        ) : u.status === 'out' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
                            Shift Done
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-primary border border-blue-200">
                            Standby
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Email and Details */}
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span className="text-slate-400">Email</span>
                        <span className="text-primary truncate max-w-[170px]" title={u.email}>{u.email}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span className="text-slate-400">Shift</span>
                        <span className="flex items-center gap-1 text-slate-700 font-semibold">
                          <Timer size={12} className="text-slate-400" />
                          {u.shiftStart || '09:00'}
                        </span>
                      </div>

                      {u.todayRecord && (
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1.5 mt-3">
                          <div className="flex justify-between text-xs font-semibold text-slate-400">
                            <span>Clock In</span>
                            <span>Clock Out</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold text-slate-800 tabular-nums">
                            <span>{format(new Date(u.todayRecord.clockIn), 'HH:mm:ss')}</span>
                            <span>{u.todayRecord.clockOut ? format(new Date(u.todayRecord.clockOut), 'HH:mm:ss') : '--:--:--'}</span>
                          </div>
                          {u.todayRecord.totalHours !== undefined && (
                            <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-medium">Logged</span>
                              <span className="font-bold text-primary">{u.todayRecord.totalHours.toFixed(1)} hrs</span>
                            </div>
                          )}
                          {u.todayRecord.authorizedByName && (
                            <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center text-[11px]">
                              <span className="text-slate-400 font-medium flex items-center gap-1">
                                <ShieldCheck size={12} className="text-blue-600" />
                                Officer Sign-Off
                              </span>
                              <span className="font-semibold text-blue-700">{u.todayRecord.authorizedByName}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-4 mt-4 border-t border-slate-100">
                    {u.status === 'standby' && (
                      <button
                        onClick={() => onAuthorizeClockIn(u)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
                      >
                        <Clock size={15} />
                        Authorize Check-In
                      </button>
                    )}
                    {u.status === 'in' && (
                      <button
                        onClick={() => onAuthorizeClockOut(u)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
                      >
                        <LogOut size={15} />
                        Authorize Check-Out
                      </button>
                    )}
                    {u.status === 'out' && (
                      <button
                        disabled
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 text-slate-400 font-bold text-xs cursor-not-allowed border border-slate-200"
                      >
                        <CheckCircle2 size={15} />
                        Shift Logged
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* VISITORS GATE PANEL */}
      {activePanelTab === 'visitors' && (
        <div className="space-y-8">
          {/* Visitor Stats & Check-In Action bento grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'all', label: 'Total Visitors Today', count: visitorStats.totalToday, color: 'border-primary text-primary bg-blue-50/50' },
              { key: 'in', label: 'Currently On Site', count: visitorStats.active, color: 'border-emerald-500 text-emerald-700 bg-emerald-50/50' },
              { key: 'out', label: 'Checked Out', count: visitorStats.completed, color: 'border-slate-400 text-slate-700 bg-slate-50/50' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setVisitorStatusFilter(item.key as any)}
                className={cn(
                  "border p-6 rounded-2xl text-left transition-all active:scale-95 flex flex-col justify-between h-32 bg-white shadow-sm",
                  visitorStatusFilter === item.key 
                    ? `${item.color} ring-2 ring-primary/20` 
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                )}
              >
                <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>
                <span className="text-3xl font-bold mt-2 tabular-nums">{item.count}</span>
              </button>
            ))}

            {/* Check-In Action Card Slot */}
            <button
              onClick={() => {
                setCheckInError('');
                setShowCheckInModal(true);
              }}
              className="border-2 border-dashed border-primary hover:bg-blue-50/50 text-primary p-6 rounded-2xl text-left transition-all active:scale-95 flex flex-col justify-between h-32 bg-white shadow-sm group"
            >
              <div className="flex justify-between items-center w-full">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">New Visitor</span>
                <Plus size={18} className="text-primary group-hover:rotate-90 transition-transform" />
              </div>
              <div>
                <span className="text-base font-bold block text-slate-800 group-hover:text-primary transition-colors">Register Guest</span>
                <p className="text-xs text-slate-400 font-medium mt-1">Issue entry pass</p>
              </div>
            </button>
          </div>

          {/* Visitor Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search guests by name, email, host, or purpose..."
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none shadow-sm placeholder:text-slate-400"
              value={visitorSearch}
              onChange={(e) => setVisitorSearch(e.target.value)}
            />
          </div>

          {/* Grid of Visitor Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVisitors.length === 0 ? (
              <div className="col-span-full bg-white rounded-3xl border border-slate-200 p-16 text-center space-y-3 shadow-sm">
                <UserIcon size={40} className="mx-auto text-slate-300" />
                <p className="text-base font-bold text-slate-700">No visitor logs found</p>
                <p className="text-slate-400 text-xs">Register a new visitor using the "Register Guest" button.</p>
              </div>
            ) : (
              filteredVisitors.map(v => (
                <div key={v.id} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition-all">
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center font-bold text-primary text-lg">
                          {v.employeeName.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-bold text-primary text-base leading-tight">{v.employeeName}</h4>
                          <p className="text-xs text-slate-400 font-medium mt-0.5">Visitor Pass</p>
                        </div>
                      </div>

                      {/* Status Indicator Badge */}
                      <div>
                        {!v.clockOut ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-xs bg-emerald-500 animate-pulse"></span>
                            On Site
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
                            Departed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Visitor Details */}
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      {v.visitorEmail && (
                        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                          <span className="text-slate-400">Email</span>
                          <span className="text-primary truncate max-w-[170px]" title={v.visitorEmail}>{v.visitorEmail}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span className="text-slate-400">Host</span>
                        <span className="text-slate-800 font-bold">{v.visitorHost}</span>
                      </div>

                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span className="text-slate-400">Purpose</span>
                        <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                          {v.visitorPurpose || 'General'}
                        </span>
                      </div>

                      {/* Timeline Logs */}
                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1.5 mt-3">
                        <div className="flex justify-between text-xs font-semibold text-slate-400">
                          <span>Gate Entry</span>
                          <span>Gate Exit</span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-slate-800 tabular-nums">
                          <span>{format(new Date(v.clockIn), 'HH:mm:ss')}</span>
                          <span>{v.clockOut ? format(new Date(v.clockOut), 'HH:mm:ss') : '--:--:--'}</span>
                        </div>
                        {v.totalHours !== undefined && (
                          <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-medium">Duration</span>
                            <span className="font-bold text-primary">{v.totalHours.toFixed(1)} hrs</span>
                          </div>
                        )}
                      </div>

                      {/* Signatures Row */}
                      <div className="grid grid-cols-2 gap-3 mt-3 pt-1">
                        {v.clockInSignature && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-slate-400 block">Entry Signature</span>
                            <div className="h-10 bg-slate-50 border border-slate-200 rounded-lg p-1 flex items-center justify-center">
                              <img src={v.clockInSignature} alt="Entry Signature" className="max-h-full max-w-full object-contain" />
                            </div>
                          </div>
                        )}
                        {v.clockOutSignature ? (
                          <div className="space-y-1">
                            <span className="text-[10px] font-semibold text-slate-400 block">Exit Signature</span>
                            <div className="h-10 bg-slate-50 border border-slate-200 rounded-lg p-1 flex items-center justify-center">
                              <img src={v.clockOutSignature} alt="Exit Signature" className="max-h-full max-w-full object-contain" />
                            </div>
                          </div>
                        ) : (
                          v.clockInSignature && (
                            <div className="space-y-1">
                              <span className="text-[10px] font-semibold text-slate-400 block">Exit Signature</span>
                              <div className="h-10 border border-dashed border-slate-200 rounded-lg flex items-center justify-center">
                                <span className="text-[10px] text-slate-400 font-medium">Pending</span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-4 mt-4 border-t border-slate-100">
                    {!v.clockOut ? (
                      <button
                        onClick={() => {
                          setCheckOutError('');
                          setSelectedVisitorForCheckOut(v);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all active:scale-95 shadow-sm"
                      >
                        <LogOut size={15} />
                        Authorize Check-Out
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-50 text-slate-400 font-bold text-xs border border-slate-200">
                        <CheckCircle2 size={15} className="text-slate-400" />
                        Gate Released
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* VISITOR CHECK-IN MODAL */}
      <AnimatePresence>
        {showCheckInModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.96, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 15 }}
              className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full relative overflow-hidden shadow-2xl flex flex-col max-h-[90vh] my-auto"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-primary text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <UserCheck className="text-white" size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold">Visitor Entry Pass</h3>
                    <p className="text-white/80 text-[11px]">Security Access Registration</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCheckInModal(false)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white"
                  aria-label="Close modal"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleVisitorCheckIn} className="p-4 sm:p-6 space-y-3.5 flex-1 overflow-y-auto min-h-0">
                {checkInError && (
                  <div className="bg-rose-50 text-rose-600 p-3 rounded-lg border border-rose-100 flex items-center gap-2 text-xs font-semibold">
                    <AlertCircle size={16} />
                    {checkInError}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 block">Full Name of Guest</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Jane Doe"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      value={visitorName}
                      onChange={(e) => setVisitorName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 block">Email Address (Optional)</label>
                    <input 
                      type="email"
                      placeholder="e.g. jane@example.com"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      value={visitorEmail}
                      onChange={(e) => setVisitorEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 block">Host Person (Whom to see)</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. John Smith"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      value={visitorHost}
                      onChange={(e) => setVisitorHost(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1 block">Purpose of Entry</label>
                    <select 
                      className="w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      value={visitorPurpose}
                      onChange={(e) => setVisitorPurpose(e.target.value)}
                    >
                      <option value="Business Meeting">Business Meeting</option>
                      <option value="Interview">Interview</option>
                      <option value="Delivery / Logistics">Delivery / Logistics</option>
                      <option value="Maintenance / Service">Maintenance / Service</option>
                      <option value="Personal Visit">Personal Visit</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Guest Entry Signature</label>
                      <button 
                        type="button" 
                        onClick={() => sigRef.current?.clear()} 
                        className="text-xs font-semibold text-rose-500 hover:underline"
                      >
                        Clear Canvas
                      </button>
                    </div>
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 h-28 sm:h-32 relative touch-none select-none">
                      <SignatureCanvas 
                        ref={sigRef} 
                        penColor="#111827" 
                        canvasProps={{ className: 'w-full h-full touch-none select-none' }} 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2 shrink-0">
                  <button 
                    type="button"
                    onClick={() => setShowCheckInModal(false)}
                    className="flex-1 py-2.5 px-4 rounded-lg font-bold text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmittingCheckIn}
                    className="flex-[2] btn-primary py-2.5 px-4 text-xs font-bold flex justify-center items-center gap-2 shadow-xs"
                  >
                    {isSubmittingCheckIn ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <>
                        <Shield size={14} />
                        Complete Check-In
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VISITOR CHECK-OUT SIGNATURE MODAL */}
      <AnimatePresence>
        {selectedVisitorForCheckOut && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl border border-slate-200 max-w-md w-full overflow-hidden shadow-2xl"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-amber-600 text-white">
                <div className="flex items-center gap-3">
                  <LogOut size={22} />
                  <div>
                    <h3 className="text-lg font-bold">Guest Release Gate</h3>
                    <p className="text-white/80 text-xs">Authorize Check-Out Exit</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedVisitorForCheckOut(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form Content */}
              <div className="p-6 space-y-4">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-1">
                  <span className="text-xs text-slate-400 font-semibold uppercase">Active Guest</span>
                  <p className="text-base font-bold text-slate-800">{selectedVisitorForCheckOut.employeeName}</p>
                  <p className="text-xs text-slate-500 font-medium">Visiting: {selectedVisitorForCheckOut.visitorHost} ({selectedVisitorForCheckOut.visitorPurpose})</p>
                  <p className="text-xs font-mono text-slate-400 pt-0.5">Entry: {format(new Date(selectedVisitorForCheckOut.clockIn), 'HH:mm:ss')}</p>
                </div>

                {checkOutError && (
                  <div className="bg-rose-50 text-rose-600 p-3 rounded-xl border border-rose-100 flex items-center gap-2 text-xs font-semibold">
                    <AlertCircle size={16} />
                    {checkOutError}
                  </div>
                )}

                {/* Exit Signature Canvas */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Guest Exit Signature</label>
                    <button 
                      type="button" 
                      onClick={() => sigOutRef.current?.clear()} 
                      className="text-xs font-semibold text-rose-500 hover:underline"
                    >
                      Clear Canvas
                    </button>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 h-32 relative">
                    <SignatureCanvas 
                      ref={sigOutRef} 
                      penColor="#111827" 
                      canvasProps={{ className: 'w-full h-full' }} 
                    />
                  </div>
                </div>

                {/* Submit Row */}
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setSelectedVisitorForCheckOut(null)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={handleVisitorCheckOut}
                    disabled={isSubmittingCheckOut}
                    className="flex-[2] bg-amber-600 text-white hover:bg-amber-700 py-3 px-4 rounded-xl text-xs font-bold flex justify-center items-center gap-2 shadow-sm transition-colors"
                  >
                    {isSubmittingCheckOut ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    ) : (
                      <>
                        <Check size={14} />
                        Complete Checkout
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
