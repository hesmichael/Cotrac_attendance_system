import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Compass, 
  X, 
  ChevronRight, 
  ChevronLeft, 
  Clock, 
  ShieldCheck, 
  FileSpreadsheet, 
  Users, 
  UserCheck, 
  Sparkles,
  Check,
  KeyRound,
  PenTool
} from 'lucide-react';
import { UserRole } from '../types';
import { LOGO_URL } from '../constants';

interface ProductTourProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: UserRole;
  userEmail?: string;
  userId?: string;
  onNavigateTab?: (tab: string) => void;
}

export default function ProductTour({ isOpen, onClose, userRole = 'staff', userEmail, userId, onNavigateTab }: ProductTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to COTRAC Portal',
      subtitle: 'Technology | Security | Fleet Management',
      icon: Clock,
      color: 'bg-blue-600 text-white',
      badge: 'Official Platform',
      content: 'Welcome to the updated COTRAC Attendance Portal. Featuring the official corporate identity, precision duty tracking, shift tolerance detection, and seamless multi-role access.',
      tip: 'Use the navigation bar at the top (or bottom on mobile) to switch between operational modules.',
      tab: 'dashboard',
      showLogo: true
    },
    {
      title: 'Dual-Factor PIN Authorization',
      subtitle: 'Fast, Cloud-Reliable Identity Verification',
      icon: KeyRound,
      color: 'bg-indigo-600 text-white',
      badge: 'Quick Fix Protocol',
      content: 'To eliminate biometric scanning freezes and cloud API delays, shift events now mandate your confidential 4-to-6 digit Employee Security PIN (default: 1234 for new accounts). Verification runs instantly in-memory with zero database latency.',
      tip: 'You can customize your personal security PIN anytime from your Profile tab.',
      tab: 'profile'
    },
    ...(userRole === 'admin' || userRole === 'sign-in' ? [
      {
        title: 'Officer Sign-Off & Terminal',
        subtitle: 'Dual Authorization for Shift Movements',
        icon: Users,
        color: 'bg-amber-600 text-white',
        badge: 'Security Gate',
        content: 'When clocking in personnel at the Terminal, the employee enters their private PIN first. Once verified, the on-duty Officer signs the digital canvas to officially witness and seal the record.',
        tip: 'Both the Employee PIN verification and Authorizing Officer name are permanently stamped on each attendance log.',
        tab: 'terminal'
      }
    ] : []),
    {
      title: 'Official Signature & Profile',
      subtitle: 'Enrolled Credentials & PIN Settings',
      icon: PenTool,
      color: 'bg-emerald-600 text-white',
      badge: 'Credentials',
      content: 'Enroll your official handwritten stroke signature and configure your 4-to-6 digit PIN. All records maintain cryptographic integrity while keeping cloud storage stress minimal.',
      tip: 'Ensure your signature is clearly legible on touchscreens or using a mouse.',
      tab: 'profile'
    },
    ...(userRole === 'admin' || userRole === 'sign-in' ? [
      {
        title: 'Attendance Reports & Excel Export',
        subtitle: 'Audit-Ready Reporting Manifests',
        icon: FileSpreadsheet,
        color: 'bg-blue-700 text-white',
        badge: 'Reporting Hub',
        content: 'Generate filtered attendance sheets with full officer verification details, punctuality percentages, and work hour aggregates. Export directly to Microsoft Excel CSV or printable PDF documents.',
        tip: 'Both Sign-in Officers and Administrators have full access to generate and download reports.',
        tab: 'reports'
      }
    ] : []),
    {
      title: 'Verified Attendance History',
      subtitle: 'Transparent Operational Audit Logs',
      icon: UserCheck,
      color: 'bg-purple-600 text-white',
      badge: 'Audit Trail',
      content: 'Review verified duty logs complete with Officer Sign-Off stamps, PIN authentication badges, and late status indicators for every shift movement.',
      tip: 'Administrators can inspect full signature stamps and adjust duty logs when necessary.',
      tab: 'attendance'
    }
  ];

  if (!isOpen) return null;

  const step = steps[currentStep] || steps[0];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const handleNext = () => {
    if (!isLast) {
      const nextIndex = currentStep + 1;
      setCurrentStep(nextIndex);
      if (onNavigateTab && steps[nextIndex]?.tab) {
        onNavigateTab(steps[nextIndex].tab);
      }
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (!isFirst) {
      const prevIndex = currentStep - 1;
      setCurrentStep(prevIndex);
      if (onNavigateTab && steps[prevIndex]?.tab) {
        onNavigateTab(steps[prevIndex].tab);
      }
    }
  };

  const markTourCompleted = () => {
    localStorage.setItem('cotrac_tour_completed', 'true');
    if (userId) {
      localStorage.setItem(`cotrac_tour_completed_${userId}`, 'true');
    }
    if (userEmail) {
      localStorage.setItem(`cotrac_tour_completed_${userEmail.toLowerCase().trim()}`, 'true');
    }
  };

  const handleComplete = () => {
    markTourCompleted();
    onClose();
  };

  const handleSkip = () => {
    markTourCompleted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-blue-950/45 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-blue-100 shadow-2xl relative my-auto"
      >
        {/* Top Progress bar */}
        <div className="w-full bg-slate-100 h-1.5 shrink-0">
          <div 
            className="bg-blue-600 h-1.5 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Modal Header */}
        <div className="p-4 sm:p-6 pb-3 flex items-start justify-between gap-3 shrink-0 border-b border-slate-50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center shadow-xs ${step.color} shrink-0`}>
              <step.icon size={20} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                <Compass size={11} /> {step.badge} : Step {currentStep + 1} of {steps.length}
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-blue-950 tracking-tight leading-tight">
                {step.title}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {step.subtitle}
              </p>
            </div>
          </div>

          <button
            onClick={handleComplete}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Close Tour"
            aria-label="Close Tour"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body - Fully scrollable flex-1 */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {step.showLogo && (
            <div className="flex items-center justify-center p-3 bg-slate-50 border border-slate-100 rounded-xl mb-1">
              <img 
                src={LOGO_URL} 
                alt="COTRAC" 
                className="h-10 sm:h-12 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          )}

          <p className="text-sm text-slate-600 leading-relaxed">
            {step.content}
          </p>

          <div className="p-3 sm:p-3.5 rounded-lg bg-blue-50/70 border border-blue-100 text-xs text-blue-900 font-medium leading-relaxed">
            <strong className="font-bold text-blue-950">Quick Tip:</strong> {step.tip}
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {steps.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentStep(idx);
                  if (onNavigateTab && steps[idx]?.tab) {
                    onNavigateTab(steps[idx].tab);
                  }
                }}
                className={`h-1.5 rounded-sm transition-all ${
                  idx === currentStep ? 'w-6 bg-blue-600' : 'w-2 bg-slate-200 hover:bg-slate-300'
                }`}
                title={`Go to step ${idx + 1}`}
                aria-label={`Step ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={handleComplete}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1 active:scale-95 min-h-[38px]"
              >
                <ChevronLeft size={15} />
                Back
              </button>
            )}

            <button
              onClick={handleNext}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1 active:scale-95 min-h-[38px]"
            >
              {isLast ? (
                <>
                  <Check size={15} />
                  Finish Tour
                </>
              ) : (
                <>
                  Next
                  <ChevronRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
