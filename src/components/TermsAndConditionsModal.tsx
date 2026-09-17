import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, X, Shield, CheckCircle2, Scale, AlertCircle } from 'lucide-react';

interface TermsAndConditionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsAndConditionsModal({ isOpen, onClose }: TermsAndConditionsModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.15 }}
          className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Scale size={20} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Terms and Conditions</h3>
                <p className="text-xs text-slate-500">COTRAC Attendance Portal - Corporate Governance & Use</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Close Terms and Conditions"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-4 sm:p-8 overflow-y-auto flex-1 min-h-0 space-y-6 text-sm text-slate-600 leading-relaxed">
            <div>
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block mb-1">
                Effective Date: January 2026
              </span>
              <p>
                These Terms and Conditions govern access to and usage of the COTRAC Attendance System. By logging in or using this application, personnel and authorized guests agree to adhere to these operational and security regulations.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <Shield size={16} className="text-blue-600" />
                1. System Access and User Responsibilities
              </h4>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
                <li>Access is restricted strictly to authorized COTRAC employees, contractors, and registered facility guests.</li>
                <li>Users are responsible for maintaining the confidentiality of their credentials, passwords, and security access PINs.</li>
                <li>Sharing accounts, clocking in on behalf of another individual (buddy punching), or submitting falsified credentials is a violation of company policy.</li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText size={16} className="text-blue-600" />
                2. Attendance Recording and Accuracy
              </h4>
              <p>
                All timestamped clock-in and clock-out logs, break durations, and lateness records recorded by the portal represent official corporate attendance records. Discrepancies must be raised promptly with authorized administrative personnel.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-blue-600" />
                3. Biometric and Signature Verification
              </h4>
              <p>
                Optical facial templates and canvas signature strokes captured during duty authorization serve as tamper-evident identity verification. Biometric data is evaluated strictly for presence confirmation and is governed by our Privacy Policy.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle size={16} className="text-blue-600" />
                4. Facility Security and Visitor Passes
              </h4>
              <p>
                Visitor passes generated through the Sign-In Hub are temporary and valid only for the designated host and date. Unescorted access outside specified zones is strictly prohibited.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <Scale size={16} className="text-blue-600" />
                5. Compliance and Amendments
              </h4>
              <p>
                COTRAC reserves the right to audit operational records and update these terms in accordance with statutory labor regulations and security standards. Continued use of the portal constitutes acceptance of revised terms.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500">Document Revision: 2026.1</span>
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs"
            >
              I Understand and Agree
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
