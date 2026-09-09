export type UserRole = 'admin' | 'staff' | 'sign-in';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  employeeId?: string;
  pin?: string; // 4-6 digit PIN for clock-in/out
  shiftStart?: string; // HH:mm:ss
  shiftEnd?: string; // HH:mm:ss
  registeredSignature?: string; // Reference signature (base64)
  latenessTolerance?: number; // Minutes
  createdAt?: any;
  password?: string;
}

export type AttendanceStatus = 'Present' | 'Late' | 'Incomplete';

export interface AttendanceRecord {
  id?: string;
  userId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  clockIn: string; // ISO string
  clockOut?: string; // ISO string
  totalHours?: number;
  status: AttendanceStatus;
  clockInSignature?: string; // base64 string
  clockOutSignature?: string; // base64 string
  signatureMatchPercentage?: number;
  signatureMatchVerified?: boolean;
  signatureMatchReason?: string;
  authorizedBy?: string;
  authorizedByName?: string;
  pinVerified?: boolean;
  verificationMethod?: 'pin_officer' | 'pin' | 'signature';
  isVisitor?: boolean;
  visitorEmail?: string;
  visitorHost?: string;
  visitorPurpose?: string;
}
