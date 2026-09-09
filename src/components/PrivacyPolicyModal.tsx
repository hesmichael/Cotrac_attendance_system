import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, Lock, Eye, FileText, CheckCircle2 } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
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
                <Shield size={20} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">Privacy Policy</h3>
                <p className="text-xs text-slate-500">COTRAC Attendance System : Data Governance</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Close Privacy Policy"
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
                This Privacy Policy outlines how COTRAC Technology, Security & Fleet Management collects, processes, and safeguards corporate personnel and visitor data within the COTRAC Attendance Portal.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText size={16} className="text-blue-600" />
                1. Information We Collect
              </h4>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
                <li>
                  <strong className="text-slate-800">Account Credentials:</strong> Employee full name, official corporate email, employee ID number, assigned role, and security access PIN.
                </li>
                <li>
                  <strong className="text-slate-800">Attendance Telemetry:</strong> Timestamped clock-in and clock-out occurrences, scheduled shift parameters, calculated duty hours, and lateness records.
                </li>
                <li>
                  <strong className="text-slate-800">Digital Signatures:</strong> Signature image data recorded during shift authorizations and visitor gate logs for compliance validation.
                </li>
                <li>
                  <strong className="text-slate-800">Visitor Gate Manifests:</strong> Full name, contact email, hosting personnel member, and purpose of visit.
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <Lock size={16} className="text-blue-600" />
                2. Data Purpose and Legal Basis
              </h4>
              <p>
                All data collected serves legitimate corporate operations, including workplace facility security, accurate work hours verification, compliance audits, and staff presence confirmation. Data processing adheres to statutory labor regulations and applicable data protection frameworks.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <Eye size={16} className="text-blue-600" />
                3. Access Control & Storage Security
              </h4>
              <p>
                Data is stored in cloud Firestore databases with Firebase-managed encryption in transit and at rest. Authenticated Firestore rules restrict access by role and record ownership:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <strong className="text-slate-900 block mb-1">Staff Members</strong>
                  Can access only their own individual clock-in/out records, signature history, and profile PIN.
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <strong className="text-slate-900 block mb-1">Sign-In Officers</strong>
                  Can verify personnel at entry gates, issue visitor badges, and export gate attendance reports.
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <strong className="text-slate-900 block mb-1">Administrators</strong>
                  Manage staff shifts, verify signatures, export compliance reports, and manage database retention.
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-blue-600" />
                4. Data Retention, Export & Rights
              </h4>
              <p>
                Attendance logs are retained for operational and audit requirements. Authorized administrators may export attendance manifests to Excel (.csv) format for payroll reconciliation. Personnel have the right to request review or correction of their personal attendance logs by contacting the corporate administrator.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 text-xs text-blue-900 space-y-1">
              <strong className="block font-bold">Contact Administration</strong>
              <p>
                For inquiries regarding data protection, access requests, or policy updates, please contact the COTRAC Systems Administrator at{' '}
                <span className="font-mono font-semibold">mojaizs@gmail.com</span>.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all active:scale-95 shadow-xs"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
