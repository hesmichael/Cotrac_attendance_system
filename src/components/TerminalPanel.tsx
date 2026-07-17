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
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
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
}

export default function TerminalPanel({ users, records, onAuthorizeClockIn, onAuthorizeClockOut }: TerminalPanelProps) {
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
    if (!visitorHost.trim()) {
      setCheckInError("Please specify whom the visitor is here to see.");
      return;
    }

    const signature = sigRef.current?.getTrimmedCanvas().toDataURL('image/png');
    if (!signature || sigRef.current?.isEmpty()) {
      setCheckInError("Check-in signature is required to complete verification.");
      return;
    }

    setIsSubmittingCheckIn(true);
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');

    const newVisitorRecord: AttendanceRecord = {
      userId: 'visitor-' + Math.random().toString(36).substr(2, 9),
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

    try {
      await addDoc(collection(db, 'attendance'), newVisitorRecord);
      setShowCheckInModal(false);
      setVisitorName('');
      setVisitorEmail('');
      setVisitorHost('');
      setVisitorPurpose('Business Meeting');
    } catch (err) {
      console.error(err);
      setCheckInError("Database connection failed. Please try again.");
    } finally {
      setIsSubmittingCheckIn(false);
    }
  };

  // Visitor Release Action
  const handleVisitorCheckOut = async () => {
    setCheckOutError('');
    if (!selectedVisitorForCheckOut || !selectedVisitorForCheckOut.id) return;

    const signature = sigOutRef.current?.getTrimmedCanvas().toDataURL('image/png');
    if (!signature || sigOutRef.current?.isEmpty()) {
      setCheckOutError("Checkout signature is required to release guest.");
      return;
    }

    setIsSubmittingCheckOut(true);
    const now = new Date();
    const clockInDate = new Date(selectedVisitorForCheckOut.clockIn);
    const totalMinutes = differenceInMinutes(now, clockInDate);
    const totalHours = totalMinutes / 60;

    try {
      await updateDoc(doc(db, 'attendance', selectedVisitorForCheckOut.id), {
        clockOut: now.toISOString(),
        totalHours: totalHours,
        clockOutSignature: signature,
        status: 'Present'
      });
      setSelectedVisitorForCheckOut(null);
    } catch (err) {
      console.error(err);
      setCheckOutError("Database write error. Please retry.");
    } finally {
      setIsSubmittingCheckOut(false);
    }
  };


  return (
    <div className="space-y-8">
      {/* Security Terminal Masthead */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-accent font-black uppercase tracking-[0.2em] italic text-xs">
            <div className="w-12 h-[2px] bg-accent"></div>
            COTRAC SECURITY OPERATIONS
          </div>
          <h2 className="text-4xl sm:text-6xl font-black text-primary tracking-tighter uppercase italic leading-none">Authorization Hub</h2>
          <p className="text-slate-500 font-medium text-lg sm:text-xl">Authorize biometric logs or secure gate passes for active entries and exits.</p>
        </div>

        {/* Real-time Clock Widget */}
        <div className="glass px-8 py-5 rounded-[2rem] flex items-center gap-4 border border-white/40 shadow-xl">
          <ShieldCheck className="text-accent animate-pulse" size={28} />
          <div className="flex flex-col">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none">Security Terminal</span>
            <span className="text-sm font-black text-primary mt-1">Status: Active Monitor</span>
          </div>
        </div>
      </div>

      {/* Panel Selector (Sub-tabs) */}
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-[2rem] w-full max-w-md border border-slate-200">
        <button
          onClick={() => setActivePanelTab('personnel')}
          className={cn(
            "flex-1 py-3 px-6 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all",
            activePanelTab === 'personnel'
              ? "bg-white text-primary shadow-md"
              : "text-slate-500 hover:text-primary hover:bg-white/40"
          )}
        >
          Personnel Terminal
        </button>
        <button
          onClick={() => setActivePanelTab('visitors')}
          className={cn(
            "flex-1 py-3 px-6 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all",
            activePanelTab === 'visitors'
              ? "bg-white text-primary shadow-md"
              : "text-slate-500 hover:text-primary hover:bg-white/40"
          )}
        >
          Visitors Gate
        </button>
      </div>

      {/* PERSONNEL TERMINAL PANEL */}
      {activePanelTab === 'personnel' && (
        <div className="space-y-8 animate-fade-in">
          {/* Terminal Stats & Filters */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'all', label: 'All Personnel', count: stats.total, color: 'border-primary text-primary bg-primary/5' },
              { key: 'in', label: 'Currently On Duty', count: stats.active, color: 'border-emerald-500 text-emerald-600 bg-emerald-50/50' },
              { key: 'out', label: 'Shift Completed', count: stats.completed, color: 'border-slate-500 text-slate-600 bg-slate-50/50' },
              { key: 'standby', label: 'Anchor Standby', count: stats.standby, color: 'border-amber-500 text-amber-600 bg-amber-50/50' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setStatusFilter(item.key as any)}
                className={cn(
                  "border-2 p-6 rounded-[2rem] text-left transition-all active:scale-95 flex flex-col justify-between h-36",
                  statusFilter === item.key 
                    ? `${item.color} shadow-lg scale-[1.02]` 
                    : 'border-slate-100 bg-white hover:border-slate-300 text-slate-600'
                )}
              >
                <span className="text-xs font-black uppercase tracking-wider">{item.label}</span>
                <span className="text-4xl font-black mt-4 tabular-nums">{item.count}</span>
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Filter personnel by ID, Name or Email address..."
              className="w-full pl-14 pr-6 py-5 rounded-[2rem] bg-white border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm placeholder:text-slate-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Grid of Personnel Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredUsers.length === 0 ? (
              <div className="col-span-full bg-white rounded-[2.5rem] border border-slate-100 p-20 text-center space-y-4">
                <AlertCircle className="mx-auto text-slate-300" size={48} />
                <p className="text-lg font-black text-slate-700 uppercase tracking-tight">No active personnel found</p>
                <p className="text-slate-400 text-sm">Verify spelling or shift availability filters.</p>
              </div>
            ) : (
              filteredUsers.map(u => (
                <div key={u.uid} className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-slate-200 hover:shadow-md transition-all duration-300">
                  {/* Background Glow */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-500"></div>
                  
                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center font-black text-primary text-xl relative">
                          {u.displayName.charAt(0)}
                          {u.biometricsEnabled && (
                            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center" title="Holographic Biometrics Activated">
                              <ShieldCheck size={10} className="text-white" />
                            </span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-black text-primary text-lg leading-tight group-hover:text-accent transition-colors">{u.displayName}</h4>
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 italic">{u.employeeId || 'ID UNASSIGNED'}</p>
                        </div>
                      </div>

                      {/* Status Indicator Badge */}
                      <div>
                        {u.status === 'in' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            On Duty
                          </span>
                        ) : u.status === 'out' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                            Shift Done
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-100">
                            Standby
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Email and Details */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span className="text-slate-400">Communication</span>
                        <span className="text-primary truncate max-w-[180px]" title={u.email}>{u.email}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span className="text-slate-400">Scheduled Shift</span>
                        <span className="flex items-center gap-1 text-slate-700">
                          <Timer size={13} className="text-slate-400" />
                          {u.shiftStart || '09:00'}
                        </span>
                      </div>

                      {u.todayRecord && (
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 mt-4">
                          <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <span>Check-In</span>
                            <span>Check-Out</span>
                          </div>
                          <div className="flex justify-between text-sm font-black text-slate-700 tabular-nums">
                            <span>{format(new Date(u.todayRecord.clockIn), 'HH:mm:ss')}</span>
                            <span>{u.todayRecord.clockOut ? format(new Date(u.todayRecord.clockOut), 'HH:mm:ss') : '--:--:--'}</span>
                          </div>
                          {u.todayRecord.totalHours !== undefined && (
                            <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Logged Duration</span>
                              <span className="text-xs font-black text-accent">{u.todayRecord.totalHours.toFixed(2)} Quota Hours</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-6 mt-6 border-t border-slate-100">
                    {u.status === 'standby' && (
                      <button
                        onClick={() => onAuthorizeClockIn(u)}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 text-white font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-500/10"
                      >
                        <Clock size={16} />
                        Authorize Check-In
                      </button>
                    )}
                    {u.status === 'in' && (
                      <button
                        onClick={() => onAuthorizeClockOut(u)}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-amber-600 text-white font-black uppercase text-xs tracking-widest hover:bg-amber-700 transition-all active:scale-95 shadow-lg shadow-amber-500/10"
                      >
                        <LogOut size={16} />
                        Authorize Check-Out
                      </button>
                    )}
                    {u.status === 'out' && (
                      <button
                        disabled
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-400 font-black uppercase text-xs tracking-widest cursor-not-allowed border border-slate-200"
                      >
                        <CheckCircle2 size={16} />
                        Session Verified
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
        <div className="space-y-8 animate-fade-in">
          {/* Visitor Stats & Check-In Action bento grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'all', label: 'Total Today', count: visitorStats.totalToday, color: 'border-primary text-primary bg-primary/5' },
              { key: 'in', label: 'Currently On Site', count: visitorStats.active, color: 'border-emerald-500 text-emerald-600 bg-emerald-50/50' },
              { key: 'out', label: 'Checked Out', count: visitorStats.completed, color: 'border-slate-500 text-slate-600 bg-slate-50/50' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => setVisitorStatusFilter(item.key as any)}
                className={cn(
                  "border-2 p-6 rounded-[2rem] text-left transition-all active:scale-95 flex flex-col justify-between h-36 bg-white",
                  visitorStatusFilter === item.key 
                    ? `${item.color} shadow-lg scale-[1.02]` 
                    : 'border-slate-100 hover:border-slate-300 text-slate-600'
                )}
              >
                <span className="text-xs font-black uppercase tracking-wider">{item.label}</span>
                <span className="text-4xl font-black mt-4 tabular-nums">{item.count}</span>
              </button>
            ))}

            {/* Check-In Action Card Slot */}
            <button
              onClick={() => {
                setCheckInError('');
                setShowCheckInModal(true);
              }}
              className="border-2 border-dashed border-accent hover:border-accent-dark bg-accent/5 hover:bg-accent/10 text-accent p-6 rounded-[2rem] text-left transition-all active:scale-95 flex flex-col justify-between h-36 shadow-lg shadow-accent/5 group"
            >
              <div className="flex justify-between items-center w-full">
                <span className="text-xs font-black uppercase tracking-widest text-accent">Visitor Slot</span>
                <Plus size={20} className="text-accent group-hover:rotate-90 transition-transform duration-300" />
              </div>
              <div>
                <span className="text-lg font-black block uppercase tracking-tight text-slate-800 leading-none group-hover:text-accent transition-colors">Register Guest</span>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2 leading-tight">Create dynamic gate entry pass</p>
              </div>
            </button>
          </div>

          {/* Visitor Search bar */}
          <div className="relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Filter active guests by visitor name, email, host, or purpose..."
              className="w-full pl-14 pr-6 py-5 rounded-[2rem] bg-white border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all shadow-sm placeholder:text-slate-400"
              value={visitorSearch}
              onChange={(e) => setVisitorSearch(e.target.value)}
            />
          </div>

          {/* Grid of Visitor Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVisitors.length === 0 ? (
              <div className="col-span-full bg-white rounded-[2.5rem] border border-slate-100 p-20 text-center space-y-4">
                <UserIcon size={48} className="mx-auto text-slate-300" />
                <p className="text-lg font-black text-slate-700 uppercase tracking-tight">No visitor logs found</p>
                <p className="text-slate-400 text-sm">Register a new visitor using the "Register Guest" button above.</p>
              </div>
            ) : (
              filteredVisitors.map(v => (
                <div key={v.id} className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-slate-200 hover:shadow-md transition-all duration-300">
                  {/* Glowing Indicator for active guests */}
                  {!v.clockOut && (
                    <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -mr-10 -mt-10 animate-pulse"></div>
                  )}

                  <div className="space-y-6">
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center font-black text-accent text-xl">
                          {v.employeeName.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-black text-primary text-lg leading-tight group-hover:text-accent transition-colors">{v.employeeName}</h4>
                          <p className="text-[9px] text-accent font-black uppercase tracking-widest mt-1">Visitor Pass</p>
                        </div>
                      </div>

                      {/* Status Indicator Badge */}
                      <div>
                        {!v.clockOut ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Active Guest
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                            Checked Out
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Visitor Details */}
                    <div className="space-y-3 pt-2 border-t border-slate-50">
                      {v.visitorEmail && (
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                          <span className="text-slate-400">Email Contact</span>
                          <span className="text-primary truncate max-w-[170px]" title={v.visitorEmail}>{v.visitorEmail}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span className="text-slate-400">Host (Whom to See)</span>
                        <span className="text-slate-800 font-bold">{v.visitorHost}</span>
                      </div>

                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span className="text-slate-400">Purpose of Visit</span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-wider border border-slate-100">
                          {v.visitorPurpose || 'General'}
                        </span>
                      </div>

                      {/* Timeline Logs */}
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 mt-4">
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <span>Gate Entry</span>
                          <span>Gate Release</span>
                        </div>
                        <div className="flex justify-between text-sm font-black text-slate-700 tabular-nums">
                          <span>{format(new Date(v.clockIn), 'HH:mm:ss')}</span>
                          <span>{v.clockOut ? format(new Date(v.clockOut), 'HH:mm:ss') : '--:--:--'}</span>
                        </div>
                        {v.totalHours !== undefined && (
                          <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Stay Duration</span>
                            <span className="text-xs font-black text-accent">{v.totalHours.toFixed(2)} Hrs</span>
                          </div>
                        )}
                      </div>

                      {/* Signatures Row */}
                      <div className="grid grid-cols-2 gap-3 mt-4 pt-2">
                        {v.clockInSignature && (
                          <div className="space-y-1">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Entry Sig</span>
                            <div className="h-12 bg-slate-50 border border-slate-100 rounded-xl p-1 flex items-center justify-center">
                              <img src={v.clockInSignature} alt="Entry Signature" className="max-h-full max-w-full object-contain filter hover:scale-110 transition-transform" />
                            </div>
                          </div>
                        )}
                        {v.clockOutSignature ? (
                          <div className="space-y-1">
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Release Sig</span>
                            <div className="h-12 bg-slate-50 border border-slate-100 rounded-xl p-1 flex items-center justify-center">
                              <img src={v.clockOutSignature} alt="Exit Signature" className="max-h-full max-w-full object-contain filter hover:scale-110 transition-transform" />
                            </div>
                          </div>
                        ) : (
                          v.clockInSignature && (
                            <div className="space-y-1">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Release Sig</span>
                              <div className="h-12 border border-dashed border-slate-200 rounded-xl flex items-center justify-center">
                                <span className="text-[9px] text-slate-300 uppercase tracking-wider font-black">Awaiting</span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="pt-6 mt-6 border-t border-slate-100">
                    {!v.clockOut ? (
                      <button
                        onClick={() => {
                          setCheckOutError('');
                          setSelectedVisitorForCheckOut(v);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-amber-600 text-white font-black uppercase text-xs tracking-widest hover:bg-amber-700 transition-all active:scale-95 shadow-lg shadow-amber-500/10"
                      >
                        <LogOut size={16} />
                        Authorize Check-Out
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-50 text-slate-400 font-black uppercase text-xs tracking-widest border border-slate-100">
                        <CheckCircle2 size={16} className="text-slate-400" />
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
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[3rem] border border-slate-200 max-w-lg w-full relative overflow-hidden shadow-3xl flex flex-col my-8"
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-primary text-white">
                <div className="flex items-center gap-3">
                  <UserCheck className="text-accent" size={28} />
                  <div>
                    <h3 className="text-xl font-black tracking-tight">Visitor Entry Pass</h3>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">COTRAC Security Access System</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCheckInModal(false)}
                  className="p-2 hover:bg-white/10 rounded-2xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleVisitorCheckIn} className="p-8 space-y-6 flex-1 overflow-y-auto max-h-[70vh]">
                {checkInError && (
                  <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl border border-rose-100 flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                    <AlertCircle size={16} />
                    {checkInError}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Name field */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic">Full Name of Guest</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      value={visitorName}
                      onChange={(e) => setVisitorName(e.target.value)}
                    />
                  </div>

                  {/* Email contact */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic">Email Address (Optional)</label>
                    <input 
                      type="email"
                      placeholder="e.g. john@example.com"
                      className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      value={visitorEmail}
                      onChange={(e) => setVisitorEmail(e.target.value)}
                    />
                  </div>

                  {/* Host field */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic">Host Person (Whom to see)</label>
                    <input 
                      type="text"
                      required
                      placeholder="e.g. Director Mo / Admin Staff"
                      className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                      value={visitorHost}
                      onChange={(e) => setVisitorHost(e.target.value)}
                    />
                  </div>

                  {/* Purpose dropdown */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic">Purpose of Entry</label>
                    <select 
                      className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
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

                  {/* Entry Signature Canvas */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Guest Entry Signature</label>
                      <button 
                        type="button" 
                        onClick={() => sigRef.current?.clear()} 
                        className="text-[9px] font-black uppercase text-rose-500 tracking-wider hover:underline"
                      >
                        Clear Canvas
                      </button>
                    </div>
                    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 h-36 relative">
                      <SignatureCanvas 
                        ref={sigRef} 
                        penColor="#111827" 
                        canvasProps={{ className: 'w-full h-full' }} 
                      />
                    </div>
                  </div>
                </div>

                {/* Submit row */}
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowCheckInModal(false)}
                    className="flex-1 px-8 py-4 rounded-xl font-black uppercase text-xs tracking-widest border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmittingCheckIn}
                    className="flex-[2] btn-primary py-4 px-8 text-xs font-black uppercase tracking-widest flex justify-center items-center gap-2 active:scale-95 transition-transform"
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
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[3rem] border border-slate-200 max-w-md w-full overflow-hidden shadow-3xl"
            >
              {/* Header */}
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-amber-600 text-white">
                <div className="flex items-center gap-3">
                  <LogOut size={24} />
                  <div>
                    <h3 className="text-xl font-black tracking-tight">Guest Release Gate</h3>
                    <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Authorize Check-Out Exit</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedVisitorForCheckOut(null)}
                  className="p-2 hover:bg-white/10 rounded-2xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form Content */}
              <div className="p-8 space-y-6">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-2">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Active Guest</span>
                  <p className="text-base font-black text-slate-800 leading-tight">{selectedVisitorForCheckOut.employeeName}</p>
                  <p className="text-xs text-slate-500 font-semibold">Visiting: {selectedVisitorForCheckOut.visitorHost} ({selectedVisitorForCheckOut.visitorPurpose})</p>
                  <p className="text-[10px] font-mono text-slate-400 pt-1">Entry Timestamp: {format(new Date(selectedVisitorForCheckOut.clockIn), 'HH:mm:ss')}</p>
                </div>

                {checkOutError && (
                  <div className="bg-rose-50 text-rose-600 p-4 rounded-2xl border border-rose-100 flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                    <AlertCircle size={16} />
                    {checkOutError}
                  </div>
                )}

                {/* Exit Signature Canvas */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Guest Exit Signature</label>
                    <button 
                      type="button" 
                      onClick={() => sigOutRef.current?.clear()} 
                      className="text-[9px] font-black uppercase text-rose-500 tracking-wider hover:underline"
                    >
                      Clear Canvas
                    </button>
                  </div>
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 h-36 relative">
                    <SignatureCanvas 
                      ref={sigOutRef} 
                      penColor="#111827" 
                      canvasProps={{ className: 'w-full h-full' }} 
                    />
                  </div>
                </div>

                {/* Submit Row */}
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setSelectedVisitorForCheckOut(null)}
                    className="flex-1 px-6 py-4 rounded-xl font-black uppercase text-xs tracking-widest border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={handleVisitorCheckOut}
                    disabled={isSubmittingCheckOut}
                    className="flex-[2] bg-amber-600 text-white hover:bg-amber-700 py-4 px-6 rounded-xl text-xs font-black uppercase tracking-widest flex justify-center items-center gap-2 active:scale-95 transition-transform shadow-lg shadow-amber-600/10"
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
