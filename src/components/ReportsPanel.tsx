import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AttendanceRecord, UserProfile, AttendanceStatus } from '../types';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  Filter, 
  Calendar, 
  Search, 
  Clock, 
  UserCheck, 
  ShieldCheck, 
  Users, 
  AlertTriangle,
  FileText,
  CheckCircle2,
  TrendingUp,
  User as UserIcon,
  Database,
  RefreshCw
} from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { isQuotaError } from '../utils/quotaHelper';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ReportsPanelProps {
  records: AttendanceRecord[];
  users: UserProfile[];
  userRole: 'admin' | 'sign-in';
}

export default function ReportsPanel({ records, users, userRole }: ReportsPanelProps) {
  // Preset filters
  const [datePreset, setDatePreset] = useState<'today' | '7days' | '30days' | 'thisMonth' | 'all' | 'custom'>('7days');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'staff' | 'visitors'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Present' | 'Late' | 'Incomplete'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const dateValidationError = datePreset === 'custom' && customStartDate && customEndDate && customStartDate > customEndDate
    ? 'The start date must be on or before the end date.'
    : '';

  // Recommendation B: On-Demand Historical Database Queries (avoids maintaining continuous perpetual listeners)
  const [historicalRecords, setHistoricalRecords] = useState<AttendanceRecord[] | null>(null);
  const [isLoadingHistorical, setIsLoadingHistorical] = useState(false);
  const [lastQueriedRange, setLastQueriedRange] = useState<string | null>(null);

  // Calculate Date bounds based on preset
  const dateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === 'today') {
      return { start: startOfDay(now), end: endOfDay(now) };
    }
    if (datePreset === '7days') {
      return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
    }
    if (datePreset === '30days') {
      return { start: startOfDay(subDays(now, 30)), end: endOfDay(now) };
    }
    if (datePreset === 'thisMonth') {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    if (datePreset === 'custom') {
      const s = customStartDate ? startOfDay(new Date(customStartDate)) : new Date(2000, 0, 1);
      const e = customEndDate ? endOfDay(new Date(customEndDate)) : endOfDay(now);
      return { start: s, end: e };
    }
    // 'all'
    return { start: new Date(2000, 0, 1), end: new Date(2099, 11, 31) };
  }, [datePreset, customStartDate, customEndDate]);

  // Execute on-demand static query for historical dates
  const handleFetchHistoricalRange = async () => {
    if (dateValidationError) return;
    setIsLoadingHistorical(true);
    try {
      const startStr = format(dateRange.start, 'yyyy-MM-dd');
      const endStr = format(dateRange.end, 'yyyy-MM-dd');
      
      const q = query(
        collection(db, 'attendance'),
        where('date', '>=', startStr),
        where('date', '<=', endStr),
        limit(500)
      );

      const snap = await getDocs(q);
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setHistoricalRecords(fetched);
      setLastQueriedRange(`${startStr} to ${endStr}`);
    } catch (err: any) {
      if (isQuotaError(err)) {
        console.warn("Targeted date query notice: Firestore read quota limit reached, using cached records.");
        setHistoricalRecords(records);
        setLastQueriedRange('Cached Local Dataset');
      } else {
        console.warn("Targeted date query fallback:", err);
        try {
          const fallbackQ = query(collection(db, 'attendance'), limit(300));
          const snap = await getDocs(fallbackQ);
          const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
          setHistoricalRecords(fetched);
          setLastQueriedRange('Database Archive');
        } catch (fallbackErr: any) {
          if (isQuotaError(fallbackErr)) {
            console.warn("Historical fetch notice: Firestore read quota limit reached, using cached records.");
            setHistoricalRecords(records);
            setLastQueriedRange('Cached Local Dataset');
          } else {
            console.warn("Failed to fetch historical reports:", fallbackErr);
          }
        }
      }
    } finally {
      setIsLoadingHistorical(false);
    }
  };

  // Switch between real-time recent records vs. on-demand queried records
  const effectiveRecords = useMemo(() => {
    if (historicalRecords !== null && (datePreset !== 'today' && datePreset !== '7days')) {
      return historicalRecords;
    }
    return records;
  }, [historicalRecords, records, datePreset]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return effectiveRecords.filter(record => {
      // Date check
      try {
        const recordDate = new Date(record.date || record.clockIn);
        if (recordDate < dateRange.start || recordDate > dateRange.end) {
          return false;
        }
      } catch {
        return false;
      }

      // Category check
      if (categoryFilter === 'staff' && record.isVisitor) return false;
      if (categoryFilter === 'visitors' && !record.isVisitor) return false;

      // Status check
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = record.employeeName?.toLowerCase().includes(term);
        const matchesHost = record.visitorHost?.toLowerCase().includes(term);
        const matchesPurpose = record.visitorPurpose?.toLowerCase().includes(term);
        const staff = users.find(u => u.uid === record.userId);
        const matchesId = staff?.employeeId?.toLowerCase().includes(term);
        const matchesEmail = (staff?.email || record.visitorEmail)?.toLowerCase().includes(term);

        if (!matchesName && !matchesHost && !matchesPurpose && !matchesId && !matchesEmail) {
          return false;
        }
      }

      return true;
    });
  }, [effectiveRecords, dateRange, categoryFilter, statusFilter, searchTerm, users]);

  // Summary Metrics
  const summary = useMemo(() => {
    const totalRecords = filteredRecords.length;
    const staffRecords = filteredRecords.filter(r => !r.isVisitor);
    const visitorRecords = filteredRecords.filter(r => r.isVisitor);
    const totalHours = filteredRecords.reduce((acc, curr) => acc + (curr.totalHours || 0), 0);
    const lateRecords = staffRecords.filter(r => r.status === 'Late').length;
    const onTimeRecords = staffRecords.filter(r => r.status === 'Present').length;
    const punctualityRate = staffRecords.length > 0 
      ? Math.round((onTimeRecords / staffRecords.length) * 100) 
      : 100;

    return {
      totalRecords,
      staffCount: staffRecords.length,
      visitorCount: visitorRecords.length,
      totalHours: totalHours.toFixed(1),
      lateCount: lateRecords,
      punctualityRate
    };
  }, [filteredRecords]);

  // Export to CSV / Excel
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) {
      alert('No records to export for the selected filter criteria.');
      return;
    }

    // CSV Headers
    const headers = [
      'Date',
      'Personnel / Visitor Name',
      'Type',
      'Employee ID / Host Info',
      'Contact Email',
      'Clock In Time',
      'Clock Out Time',
      'Total Duty Hours',
      'Attendance Status',
      'Verification Method',
      'Authorized By Officer',
      'Purpose / Notes'
    ];

    const rows = filteredRecords.map(r => {
      const staff = users.find(u => u.uid === r.userId);
      const formattedDate = r.date || (r.clockIn ? format(new Date(r.clockIn), 'yyyy-MM-dd') : '');
      const clockInTime = r.clockIn ? format(new Date(r.clockIn), 'HH:mm:ss') : '';
      const clockOutTime = r.clockOut ? format(new Date(r.clockOut), 'HH:mm:ss') : '';
      const typeStr = r.isVisitor ? 'Visitor / Guest' : 'Staff Personnel';
      const idOrHost = r.isVisitor ? `Host: ${r.visitorHost || 'N/A'}` : (staff?.employeeId || 'ID Unassigned');
      const emailStr = r.isVisitor ? (r.visitorEmail || 'N/A') : (staff?.email || 'N/A');
      const hoursStr = r.totalHours !== undefined ? r.totalHours.toFixed(2) : '0.00';
      const verificationStr = r.biometricVerified ? 'Biometric Face Match' : (r.clockInSignature ? 'Digital Signature' : 'PIN / Password');
      const authBy = r.authorizedByName ? `Authorized by ${r.authorizedByName}` : 'Direct Self';
      const notes = r.isVisitor ? (r.visitorPurpose || 'Meeting') : (r.signatureMatchPercentage ? `AI Match: ${r.signatureMatchPercentage}%` : '');

      return [
        `"${formattedDate}"`,
        `"${(r.employeeName || '').replace(/"/g, '""')}"`,
        `"${typeStr}"`,
        `"${idOrHost.replace(/"/g, '""')}"`,
        `"${emailStr.replace(/"/g, '""')}"`,
        `"${clockInTime}"`,
        `"${clockOutTime}"`,
        `"${hoursStr}"`,
        `"${r.status || 'Present'}"`,
        `"${verificationStr}"`,
        `"${authBy.replace(/"/g, '""')}"`,
        `"${notes.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');
    link.setAttribute('href', url);
    link.setAttribute('download', `COTRAC_Attendance_Report_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: 'a4'
      });

      // Header Banner - COTRAC Deep Blue
      doc.setFillColor(30, 58, 138);
      doc.rect(0, 0, doc.internal.pageSize.width, 60, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(255, 255, 255);
      doc.text('COTRAC ATTENDANCE & AUDIT REPORT', 40, 36);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(219, 234, 254);
      doc.text('Corporate Time & Attendance Registry and Security Gate Verification System', 40, 50);

      // Meta Info Banner
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      const generatedDate = format(new Date(), 'MMMM dd, yyyy HH:mm');
      doc.text(`Generated: ${generatedDate}`, 40, 78);
      
      let periodLabel = 'All Dates';
      if (datePreset === 'today') periodLabel = 'Today';
      else if (datePreset === '7days') periodLabel = 'Last 7 Days';
      else if (datePreset === '30days') periodLabel = 'Last 30 Days';
      else if (datePreset === 'thisMonth') periodLabel = 'Current Month';
      else if (customStartDate || customEndDate) periodLabel = `${customStartDate || 'Start'} to ${customEndDate || 'Present'}`;
      
      doc.text(`Report Period: ${periodLabel}`, 240, 78);
      doc.text(`Total Filtered: ${filteredRecords.length} records`, 450, 78);

      // Summary Statistics strip
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(40, 88, doc.internal.pageSize.width - 80, 36, 6, 6, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Staff Records: ${summary.staffCount}   |   Visitor Passes: ${summary.visitorCount}   |   Total Duty Hours: ${summary.totalHours} hrs   |   Punctuality Rate: ${summary.punctualityRate}%`,
        50,
        110
      );

      // Table Content Mapping
      const tableData = filteredRecords.map(r => {
        const staff = users.find(u => u.uid === r.userId);
        const dateStr = r.date ? format(new Date(r.date), 'dd/MM/yyyy') : '--';
        const typeStr = r.isVisitor ? 'Visitor' : 'Staff';
        const idOrHost = r.isVisitor ? `Host: ${r.visitorHost || 'Direct'}` : (staff?.employeeId || 'Staff');
        const clockInTime = r.clockIn ? format(new Date(r.clockIn), 'HH:mm:ss') : '--';
        const clockOutTime = r.clockOut ? format(new Date(r.clockOut), 'HH:mm:ss') : '--:--:--';
        const hoursStr = r.totalHours !== undefined ? `${r.totalHours.toFixed(1)} hrs` : '--';
        const statusStr = r.status || 'Present';
        const verificationStr = r.biometricVerified ? 'Face ID Verified' : r.clockInSignature ? 'Signed Canvas' : 'PIN / Auto';

        return [
          dateStr,
          r.employeeName || 'Unknown',
          typeStr,
          idOrHost,
          clockInTime,
          clockOutTime,
          hoursStr,
          statusStr,
          verificationStr
        ];
      });

      autoTable(doc, {
        startY: 135,
        head: [['Date', 'Personnel / Guest', 'Type', 'ID / Host', 'Clock In', 'Clock Out', 'Hours', 'Status', 'Verification']],
        body: tableData.length > 0 ? tableData : [['--', 'No records match filter', '--', '--', '--', '--', '--', '--', '--']],
        theme: 'striped',
        headStyles: {
          fillColor: [37, 99, 235],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5
        },
        styles: {
          fontSize: 8,
          cellPadding: 6,
          textColor: [30, 41, 59]
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        didDrawPage: (data) => {
          const totalPages = (doc.internal as any).getNumberOfPages ? (doc.internal as any).getNumberOfPages() : 1;
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `COTRAC Security & Compliance Manifest - Page ${data.pageNumber} of ${totalPages}`,
            40,
            doc.internal.pageSize.height - 20
          );
        }
      });

      const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');
      doc.save(`COTRAC_Attendance_Report_${timestamp}.pdf`);
    } catch (err) {
      console.error('PDF export fallback:', err);
      window.print();
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 sm:space-y-8 print:p-0">
      {/* Header & Export Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 sm:gap-6 print:hidden">
        <div>
          <div className="flex items-center gap-2 text-blue-700 font-bold uppercase tracking-wider text-xs">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            {userRole === 'admin' ? 'Executive & Compliance Reporting' : 'Gate & Attendance Reporting'}
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-blue-950 tracking-tight mt-1">
            Attendance & Audit Reports
          </h2>
          <p className="text-slate-500 font-normal text-sm sm:text-base mt-1">
            Generate customized attendance manifests, payroll hour summaries, and download PDF or Excel reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={handleExportPDF}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-all active:scale-95"
            title="Download formatted attendance manifest as a PDF document"
          >
            <Download size={18} />
            Download PDF Report
          </button>
          <button
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all active:scale-95"
            title="Export filtered records directly to an Excel-compatible CSV spreadsheet"
          >
            <FileSpreadsheet size={18} />
            Export to Excel (.csv)
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-sm shadow-sm transition-all active:scale-95"
            title="Open browser print dialog"
          >
            <Printer size={18} />
            Print View
          </button>
        </div>
      </div>

      {/* Summary KPI Cards (Responsive grid: 1 col on mobile, 2 col on tablet, 4 col on desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Filtered Records</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <FileText size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-blue-950 tabular-nums">{summary.totalRecords}</span>
            <span className="text-xs text-slate-500 font-medium">total sessions</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>{summary.staffCount} Staff</span>
            <span>•</span>
            <span>{summary.visitorCount} Visitors</span>
          </div>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Duty Hours</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-900 tabular-nums">{summary.totalHours}</span>
            <span className="text-xs text-slate-500 font-medium">hours</span>
          </div>
          <p className="text-xs text-slate-500 pt-1 border-t border-slate-100">
            Across {summary.staffCount} personnel logs
          </p>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Punctuality Rate</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-purple-950 tabular-nums">{summary.punctualityRate}%</span>
            <span className="text-xs text-slate-500 font-medium">on-time</span>
          </div>
          <p className="text-xs text-slate-500 pt-1 border-t border-slate-100">
            {summary.lateCount} recorded late arrival(s)
          </p>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Guest & Gate Flow</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-950 tabular-nums">{summary.visitorCount}</span>
            <span className="text-xs text-slate-500 font-medium">visitors</span>
          </div>
          <p className="text-xs text-slate-500 pt-1 border-t border-slate-100">
            Logged through security gate
          </p>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4 print:hidden">
        {/* Date presets */}
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
            Timeframe Preset
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'today', label: 'Today' },
              { id: '7days', label: 'Last 7 Days' },
              { id: '30days', label: 'Last 30 Days' },
              { id: 'thisMonth', label: 'This Month' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom Range...' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setDatePreset(p.id as any)}
                className={cn(
                  "px-3.5 py-2 rounded-xl text-xs font-bold transition-all",
                  datePreset === p.id 
                    ? "bg-blue-600 text-white shadow-xs" 
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Recommendation B: Static / Historical On-Demand Fetch Action */}
          {(datePreset !== 'today' && datePreset !== '7days') && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Database className="w-4 h-4 text-blue-600" />
                <span>
                  {historicalRecords !== null 
                    ? `Loaded ${historicalRecords.length} archive records on-demand (${lastQueriedRange})`
                    : 'Query historical archive on-demand to minimize database quota consumption'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleFetchHistoricalRange}
                disabled={isLoadingHistorical}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 transition-all text-xs cursor-pointer"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingHistorical && "animate-spin")} />
                {isLoadingHistorical ? "Querying Database..." : "Fetch Archive On-Demand"}
              </button>
            </div>
          )}
        </div>

        {/* Custom date range inputs */}
        {datePreset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">From Date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                aria-invalid={Boolean(dateValidationError)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 mb-1 block">To Date</label>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                aria-invalid={Boolean(dateValidationError)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
            {dateValidationError && (
              <p className="sm:col-span-2 text-xs text-rose-600 font-semibold" role="alert">
                {dateValidationError}
              </p>
            )}
          </div>
        )}

        {/* Detailed filters grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All (Staff & Visitors)</option>
              <option value="staff">Staff Only</option>
              <option value="visitors">Visitors Only</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Statuses</option>
              <option value="Present">Present / Punctual</option>
              <option value="Late">Late Arrivals</option>
              <option value="Incomplete">Incomplete / Active</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Search Filter</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search name, host, ID..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Printable Title (visible only during print) */}
      <div className="hidden print:block mb-6 border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-black text-slate-900">COTRAC Attendance & Operational Audit Report</h1>
        <p className="text-xs text-slate-600 mt-1">Generated: {format(new Date(), 'PPpp')}</p>
        <p className="text-xs text-slate-600">Total Records: {summary.totalRecords} | Total Duty Hours: {summary.totalHours} hrs | Punctuality: {summary.punctualityRate}%</p>
      </div>

      {/* Report Records Table (Responsive: Table for tablet/desktop, Clean cards for mobile) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="text-sm font-bold text-blue-950">
            Report Data Results ({filteredRecords.length} records)
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Sorted by most recent
          </span>
        </div>

        {/* Desktop / Tablet Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-xs font-bold tracking-wider">
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Subject</th>
                <th className="px-5 py-3.5">Type</th>
                <th className="px-5 py-3.5">Clock In</th>
                <th className="px-5 py-3.5">Clock Out</th>
                <th className="px-5 py-3.5">Hours</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-medium">
                    No attendance or gate records matched your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => {
                  const staff = users.find(u => u.uid === r.userId);
                  return (
                    <tr key={r.id || idx} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900 whitespace-nowrap">
                        {r.date ? format(new Date(r.date), 'MMM dd, yyyy') : '--'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-blue-950">{r.employeeName}</div>
                        <div className="text-xs text-slate-400">
                          {r.isVisitor 
                            ? `Host: ${r.visitorHost || 'Direct'}` 
                            : (staff?.employeeId || staff?.email || 'Staff')}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-bold",
                          r.isVisitor 
                            ? "bg-amber-100 text-amber-800" 
                            : "bg-blue-100 text-blue-800"
                        )}>
                          {r.isVisitor ? 'Visitor' : 'Staff'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-700 whitespace-nowrap">
                        {r.clockIn ? format(new Date(r.clockIn), 'HH:mm:ss') : '--'}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-700 whitespace-nowrap">
                        {r.clockOut ? format(new Date(r.clockOut), 'HH:mm:ss') : '--:--:--'}
                      </td>
                      <td className="px-5 py-3.5 font-bold tabular-nums text-blue-950 whitespace-nowrap">
                        {r.totalHours !== undefined ? `${r.totalHours.toFixed(1)} hrs` : '--'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-md text-xs font-bold",
                          r.status === 'Present' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                          r.status === 'Late' && "bg-amber-50 text-amber-700 border border-amber-200",
                          r.status === 'Incomplete' && "bg-rose-50 text-rose-700 border border-rose-200"
                        )}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                        {r.biometricVerified ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 size={13} /> Biometric
                          </span>
                        ) : r.clockInSignature ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                            <ShieldCheck size={13} /> Signed
                          </span>
                        ) : (
                          <span className="text-slate-400">PIN / Auto</span>
                        )}
                        {r.authorizedByName && (
                          <div className="text-[10px] text-slate-400">by {r.authorizedByName}</div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View (phone sizes < 768px) */}
        <div className="md:hidden p-4 space-y-3">
          {filteredRecords.length === 0 ? (
            <p className="py-12 text-center text-slate-400 font-medium text-sm">
              No attendance or gate records matched your filter criteria.
            </p>
          ) : (
            filteredRecords.map((r, idx) => {
              const staff = users.find(u => u.uid === r.userId);
              return (
                <div key={r.id || idx} className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200 space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-bold text-blue-950">{r.employeeName}</div>
                      <div className="text-xs text-slate-500">
                        {r.date ? format(new Date(r.date), 'MMM dd, yyyy') : '--'}
                      </div>
                    </div>
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-md text-xs font-bold",
                      r.status === 'Present' && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                      r.status === 'Late' && "bg-amber-50 text-amber-700 border border-amber-200",
                      r.status === 'Incomplete' && "bg-rose-50 text-rose-700 border border-rose-200"
                    )}>
                      {r.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/60">
                    <div>
                      <span className="text-slate-400 block">Duty Time:</span>
                      <span className="font-semibold text-slate-800">
                        {r.clockIn ? format(new Date(r.clockIn), 'HH:mm') : '--'} - {r.clockOut ? format(new Date(r.clockOut), 'HH:mm') : '--'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Total Hours:</span>
                      <span className="font-bold text-blue-900">
                        {r.totalHours ? `${r.totalHours.toFixed(1)} hrs` : '--'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span className={cn(
                      "px-2 py-0.5 rounded-md font-bold text-[10px]",
                      r.isVisitor ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                    )}>
                      {r.isVisitor ? `Visitor (Host: ${r.visitorHost || 'N/A'})` : (staff?.employeeId || 'Staff')}
                    </span>
                    <span>
                      {r.biometricVerified ? '✓ Biometric' : r.clockInSignature ? '✓ Signed' : 'PIN'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
