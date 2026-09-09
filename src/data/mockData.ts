import { UserProfile, AttendanceRecord } from '../types';

export const MOCK_USERS: UserProfile[] = [
  {
    uid: 'user-admin-001',
    displayName: 'Corporate Administrator',
    email: 'admin@cotracnigeria.com',
    role: 'admin',
    employeeId: 'COT-ADM-001',
    shiftStart: '08:30',
    latenessTolerance: 10,
    pin: '1234',
    registeredSignature: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="10" y="25" font-family="cursive" font-size="20" fill="%232563eb">Amina M.</text></svg>',
  },
  {
    uid: 'user-staff-002',
    displayName: 'Chukwudi Okonkwo',
    email: 'cokonkwo@cotracnigeria.com',
    role: 'staff',
    employeeId: 'COT-ENG-012',
    shiftStart: '08:30',
    latenessTolerance: 10,
    pin: '1234',
  },
  {
    uid: 'user-staff-003',
    displayName: 'Anthony Maduabuchi',
    email: 'anthony.maduabuchi@cotracnigeria.com',
    role: 'staff',
    employeeId: 'COT-ENG-015',
    shiftStart: '08:30',
    latenessTolerance: 10,
    pin: '1234',
  },
  {
    uid: 'user-officer-004',
    displayName: 'David Okon (Security Officer)',
    email: 'security@cotracnigeria.com',
    role: 'sign-in',
    employeeId: 'COT-SEC-002',
    shiftStart: '07:00',
    latenessTolerance: 15,
    pin: '0000',
  }
];

// Clean state: no redundant mock attendance logs
export const MOCK_RECORDS: AttendanceRecord[] = [];

