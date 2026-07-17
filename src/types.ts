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
  biometricsEnabled?: boolean;
  biometricType?: 'face' | 'fingerprint';
  facePhoto?: string; // Base64 reference face photo
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
  biometricVerified?: boolean;
  biometricType?: 'face' | 'fingerprint';
  biometricStamp?: string; // base64 string
  clockOutBiometricVerified?: boolean;
  clockOutBiometricType?: 'face' | 'fingerprint';
  clockOutBiometricStamp?: string; // base64 string
  authorizedBy?: string;
  authorizedByName?: string;
  isVisitor?: boolean;
  visitorEmail?: string;
  visitorHost?: string;
  visitorPurpose?: string;
}
