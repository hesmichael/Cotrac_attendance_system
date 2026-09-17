import { UserProfile, AttendanceRecord } from '../types';

export const MOCK_USERS: UserProfile[] = [
  {
    uid: 'custom-mojaizs@gmail.com',
    displayName: 'Corporate Administrator',
    email: 'mojaizs@gmail.com',
    role: 'admin',
    employeeId: 'COT-ADM-001',
    shiftStart: '08:30',
    shiftEnd: '17:00',
    latenessTolerance: 15,
    pin: '1234',
    password: 'AC@123',
    biometricsEnabled: false
  }
];

// Clean state: no redundant mock attendance logs
export const MOCK_RECORDS: AttendanceRecord[] = [];

