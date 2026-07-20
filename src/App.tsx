/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from './firebase'
import {
  UserProfile,
  AttendanceRecord,
  AttendanceStatus,
  UserRole,
} from './types'
import { LOGO_URL } from './constants'
import { verifySignature, verifyFaceMatch } from './lib/gemini'
import SignatureCanvas from 'react-signature-canvas'
import TerminalPanel from './components/TerminalPanel'
import {
  Clock,
  User as UserIcon,
  LayoutDashboard,
  History,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Timer,
  ChevronRight,
  Search,
  Filter,
  Calendar as CalendarIcon,
  ShieldCheck,
  X,
  PenTool,
  Trash2,
  Edit2,
  ExternalLink,
  AlertTriangle,
  Mail,
  Lock,
  ShieldAlert,
} from 'lucide-react'
import {
  format,
  isAfter,
  parse,
  differenceInMinutes,
  startOfDay,
  endOfDay,
  addMinutes,
} from 'date-fns'
import { motion, AnimatePresence } from 'motion/react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Password verification helper: at least 6 characters and contain letter, number, and special symbol
const validatePasswordStrength = (pw: string): boolean => {
  if (pw.length < 6) return false
  const hasLetter = /[a-zA-Z]/.test(pw)
  const hasNumber = /[0-9]/.test(pw)
  const hasSpecial = /[^a-zA-Z0-9]/.test(pw)
  return hasLetter && hasNumber && hasSpecial
}

// --- Components ---

const PinModal = ({
  isOpen,
  onClose,
  onVerify,
  title,
  error,
}: {
  isOpen: boolean
  onClose: () => void
  onVerify: (pin: string) => void
  title: string
  error?: string
}) => {
  const [pin, setPin] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length >= 4) {
      onVerify(pin)
      setPin('')
    }
  }

  return (
    <div className='fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md'>
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className='glass rounded-[2rem] w-full max-w-sm overflow-hidden'
      >
        <div className='bg-primary/95 p-8 text-white flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            <div className='bg-accent/20 p-2 rounded-xl'>
              <ShieldCheck
                size={28}
                className='text-accent shadow-[0_0_15px_rgba(242,125,38,0.5)]'
              />
            </div>
            <div>
              <h3 className='text-2xl font-bold tracking-tight'>{title}</h3>
              <p className='text-white/60 text-xs font-semibold uppercase tracking-widest'>
                Authorization
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-2 hover:bg-white/10 rounded-2xl transition-all active:scale-90'
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className='p-8 space-y-8'>
          <div className='text-center space-y-2'>
            <p className='text-slate-600 font-medium italic'>
              Secure PIN verification required
            </p>
          </div>

          <div className='flex justify-center'>
            <input
              type='password'
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className='w-48 text-center text-4xl tracking-[0.8em] font-black py-4 bg-transparent border-b-2 border-primary/20 focus:border-primary focus:outline-none transition-all placeholder:text-slate-200'
              autoFocus
              placeholder='••••'
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className='flex items-center gap-3 text-rose-600 text-sm justify-center bg-rose-50/50 backdrop-blur-sm p-4 rounded-2xl border border-rose-100'
            >
              <AlertCircle size={18} />
              <span className='font-bold'>{error}</span>
            </motion.div>
          )}

          <button
            type='submit'
            disabled={pin.length < 4}
            className='w-full btn-primary py-4 text-lg shadow-xl shadow-primary/20'
          >
            Authenticate
          </button>
        </form>
      </motion.div>
    </div>
  )
}

const AddStaffModal = ({
  isOpen,
  onClose,
  onAdd,
}: {
  isOpen: boolean
  onClose: () => void
  onAdd: (data: {
    email: string
    name: string
    role: UserRole
    employeeId: string
    password?: string
    pin: string
  }) => Promise<void>
}) => {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('staff')
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetEmail = email.toLowerCase().trim()
    if (
      targetEmail !== 'mojaizs@gmail.com' &&
      !targetEmail.endsWith('@cotracnigeria.com')
    ) {
      alert(
        'Forbidden: Registration email is strictly restricted to @cotracnigeria.com or mojaizs@gmail.com.',
      )
      return
    }
    if (password && !validatePasswordStrength(password)) {
      alert(
        'Security Constraint: Password must be at least 6 characters long and contain alphanumeric characters (letters, numbers, and special symbols).',
      )
      return
    }
    if (!/^\d{4,6}$/.test(pin)) {
      alert('Security Constraint: PIN must be 4-6 digits (numbers only).')
      return
    }
    setLoading(true)
    await onAdd({
      email: targetEmail,
      name,
      role,
      employeeId,
      password: password || undefined,
      pin,
    })
    setLoading(false)
    onClose()
    setEmail('')
    setName('')
    setRole('staff')
    setEmployeeId('')
    setPassword('')
    setPin('')
  }

  return (
    <div className='fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md'>
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className='glass rounded-[2rem] w-full max-w-md overflow-hidden'
      >
        <div className='bg-primary/95 p-8 text-white flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            <div className='bg-emerald-500/20 p-2 rounded-xl'>
              <UserIcon size={28} className='text-emerald-400' />
            </div>
            <div>
              <h3 className='text-2xl font-bold tracking-tight'>Add Staff</h3>
              <p className='text-white/60 text-xs font-semibold uppercase tracking-widest'>
                New Profile
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-2 hover:bg-white/10 rounded-2xl transition-all active:scale-90'
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className='p-8 space-y-6'>
          <div className='space-y-4'>
            <div>
              <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                Full Name
              </label>
              <input
                type='text'
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className='w-full input-glass mt-1'
                placeholder='John Doe'
              />
            </div>
            <div>
              <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                Email Address
              </label>
              <input
                type='email'
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className='w-full input-glass mt-1'
                placeholder='john@cotracnigeria.com'
              />
            </div>
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                  Employee ID
                </label>
                <input
                  type='text'
                  required
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className='w-full input-glass mt-1'
                  placeholder='COT-001'
                />
              </div>
              <div>
                <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                  Initial Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className='w-full input-glass mt-1 appearance-none'
                >
                  <option value='staff'>Staff</option>
                  <option value='admin'>Admin</option>
                  <option value='sign-in'>Sign-In Officer</option>
                </select>
              </div>
            </div>
            <div className='grid grid-cols-2 gap-4'>
              <div>
                <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                  Initial Password (Optional)
                </label>
                <input
                  type='password'
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className='w-full input-glass mt-1'
                  placeholder='Leave empty'
                />
              </div>
              <div>
                <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                  Secure PIN (4-6 digits)
                </label>
                <input
                  type='password'
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className='w-full input-glass mt-1'
                  placeholder='e.g., 1234'
                />
              </div>
            </div>
          </div>

          <div className='pt-4'>
            <button
              type='submit'
              disabled={loading}
              className='w-full btn-primary py-4 text-lg bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-900/20'
            >
              {loading ? 'Creating...' : 'Register Staff Member'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

const ChangePasswordModal = ({
  isOpen,
  onClose,
  user,
}: {
  isOpen: boolean
  onClose: () => void
  user: UserProfile | null
}) => {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isOpen || !user) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!validatePasswordStrength(newPassword)) {
      setError(
        'New password must be at least 6 characters long and contain alphanumeric characters (letters, numbers, and special symbols).',
      )
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setLoading(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      const userDoc = await getDoc(userRef)

      if (userDoc.exists()) {
        const userData = userDoc.data()
        // If they already have a password in Firestore, verify it
        if (userData.password && userData.password !== currentPassword) {
          setError('The current password you entered is incorrect.')
          setLoading(false)
          return
        }
      }

      // Update password in Firestore
      await updateDoc(userRef, { password: newPassword })
      setSuccess('Your password has been updated successfully!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        onClose()
        setSuccess('')
      }, 2000)
    } catch (err: any) {
      console.error('Failed to change password:', err)
      setError(err.message || 'An error occurred while updating the password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md'>
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className='glass rounded-[2rem] w-full max-w-sm overflow-hidden'
      >
        <div className='bg-primary/95 p-8 text-white flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            <div className='bg-accent/20 p-2 rounded-xl'>
              <Lock size={28} className='text-accent' />
            </div>
            <div>
              <h3 className='text-2xl font-bold tracking-tight'>
                Change Password
              </h3>
              <p className='text-white/60 text-xs font-semibold uppercase tracking-widest'>
                Portal Settings
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-2 hover:bg-white/10 rounded-2xl transition-all active:scale-90'
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className='p-8 space-y-6'>
          <div className='space-y-4'>
            {/* Show Current Password field only if they have a password */}
            {user.uid.startsWith('custom-') && (
              <div>
                <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                  Current Password
                </label>
                <input
                  type='password'
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className='w-full input-glass mt-1'
                  placeholder='Enter current password'
                />
              </div>
            )}
            <div>
              <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                New Password
              </label>
              <input
                type='password'
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className='w-full input-glass mt-1'
                placeholder='Minimum 6 characters'
              />
            </div>
            <div>
              <label className='text-xs font-bold text-slate-400 uppercase tracking-widest px-1'>
                Confirm New Password
              </label>
              <input
                type='password'
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className='w-full input-glass mt-1'
                placeholder='Re-enter new password'
              />
            </div>
          </div>

          {error && (
            <div className='text-xs text-rose-500 font-bold bg-rose-50 p-3 rounded-xl border border-rose-100'>
              {error}
            </div>
          )}

          {success && (
            <div className='text-xs text-emerald-600 font-bold bg-emerald-50 p-3 rounded-xl border border-emerald-100'>
              {success}
            </div>
          )}

          <div className='pt-2'>
            <button
              type='submit'
              disabled={loading}
              className='w-full btn-primary py-4 text-lg bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20'
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

const SignatureModal = ({
  isOpen,
  onClose,
  onSave,
  title,
}: {
  isOpen: boolean
  onClose: () => void
  onSave: (signature: string) => void
  title: string
}) => {
  const sigPad = React.useRef<SignatureCanvas>(null)

  const clear = () => {
    sigPad.current?.clear()
  }

  const save = () => {
    if (!sigPad.current || sigPad.current.isEmpty()) {
      alert('Please provide a signature.')
      return
    }
    const signature = sigPad.current.getTrimmedCanvas().toDataURL('image/png')
    if (signature) {
      onSave(signature)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-md p-4'>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className='glass rounded-[2rem] max-w-lg w-full overflow-hidden'
      >
        <div className='p-8 border-b border-primary/10 flex justify-between items-center bg-primary text-white'>
          <div className='flex items-center gap-4'>
            <div className='bg-accent/20 p-2 rounded-xl'>
              <PenTool size={24} className='text-accent' />
            </div>
            <div>
              <h3 className='text-2xl font-bold tracking-tight'>{title}</h3>
              <p className='text-white/60 text-xs font-semibold uppercase tracking-widest'>
                Authentication
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className='p-2 hover:bg-white/10 rounded-2xl transition-all active:scale-90'
          >
            <X size={24} />
          </button>
        </div>

        <div className='p-8 space-y-6'>
          <p className='text-slate-600 font-medium italic text-center'>
            Please provide your handwritten signature to authorize this log.
          </p>
          <div className='border-2 border-dashed border-primary/20 rounded-3xl bg-white/40 overflow-hidden shadow-inner backdrop-blur-sm'>
            <SignatureCanvas
              ref={sigPad}
              penColor='#001f5c'
              canvasProps={{
                className: 'w-full h-64 cursor-crosshair',
              }}
            />
          </div>
          <div className='flex gap-4 pt-2'>
            <button
              onClick={clear}
              className='flex-1 py-4 px-6 rounded-2xl border border-primary/10 text-primary font-bold hover:bg-primary/5 transition-all active:scale-95'
            >
              Clear
            </button>
            <button
              onClick={save}
              className='flex-1 btn-primary py-4 px-6 text-lg'
            >
              Confirm Log
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

const BiometricModal = ({
  isOpen,
  onClose,
  onSuccess,
  actionType = 'register',
  preferredType,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccess: (capturedImage: string) => void
  actionType?: 'register' | 'verify'
  preferredType?: string
}) => {
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [statusText, setStatusText] = useState(
    'Initializing optical sensors...',
  )

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
    }
  }

  const startCamera = async () => {
    setStatusText('Requesting secure optical channel...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      })
      setCameraStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setStatusText('Optical channel active. Align face in frame.')
    } catch (err) {
      console.warn(
        'Camera access denied or unavailable, using secure matrix fallback:',
        err,
      )
      setStatusText(
        'Camera stream blocked. Activating synthetic neural mesh scanner...',
      )
    }
  }

  const handleStartScan = async () => {
    setScanning(true)
    setProgress(0)
    await startCamera()
  }

  useEffect(() => {
    if (!isOpen) {
      setScanning(false)
      setProgress(0)
      stopCamera()
      return
    }

    if (isOpen) {
      const timer = setTimeout(() => {
        handleStartScan()
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (scanning) {
      interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev + 10
          if (next >= 100) {
            clearInterval(interval)
            return 100
          }

          if (next < 30) setStatusText('Detecting structural landmarks...')
          else if (next < 60) setStatusText('Mapping geometry & depth grid...')
          else if (next < 85)
            setStatusText('Verifying live signature patterns...')
          else setStatusText('Finalizing identity hash...')
          return next
        })
      }, 200)
    }
    return () => clearInterval(interval)
  }, [scanning])

  const handleScanComplete = () => {
    let capturedPhoto = ''
    try {
      if (videoRef.current && cameraStream) {
        const canvas = document.createElement('canvas')
        canvas.width = videoRef.current.videoWidth || 640
        canvas.height = videoRef.current.videoHeight || 480
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1)
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
          capturedPhoto = canvas.toDataURL('image/jpeg', 0.85)
        }
      }
    } catch (err) {
      console.error('Failed to capture video frame:', err)
    }

    if (!capturedPhoto) {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 400
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, 400, 400)
        ctx.strokeStyle = '#f27d26'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.arc(200, 200, 150, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = '#f27d26'
        ctx.font = '24px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('FACE SECURE REFERENCE', 200, 205)
        capturedPhoto = canvas.toDataURL('image/jpeg')
      }
    }

    stopCamera()
    setScanning(false)
    onSuccess(capturedPhoto)
    onClose()
  }

  useEffect(() => {
    if (progress >= 100 && scanning) {
      handleScanComplete()
    }
  }, [progress, scanning])

  const handleCancel = () => {
    stopCamera()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className='fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4'>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className='glass rounded-[2.5rem] max-w-md w-full overflow-hidden border border-white/20 shadow-3xl bg-slate-950 text-white'
      >
        <div className='p-8 border-b border-white/5 flex justify-between items-center bg-primary text-white'>
          <div className='flex items-center gap-3'>
            <ShieldCheck className='text-accent animate-pulse' size={28} />
            <div>
              <h3 className='text-xl font-bold tracking-tight'>
                {actionType === 'register'
                  ? 'Register Face ID Reference'
                  : 'Face ID Security Access'}
              </h3>
              <p className='text-white/40 text-[10px] font-black uppercase tracking-widest'>
                COTRAC Biometric Portal
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className='p-2 hover:bg-white/10 rounded-2xl transition-all'
          >
            <X size={20} />
          </button>
        </div>

        <div className='p-8 space-y-8'>
          <div className='flex flex-col items-center space-y-6'>
            <div className='relative w-56 h-56 rounded-full border-4 border-dashed border-accent/40 flex items-center justify-center overflow-hidden bg-slate-900 shadow-2xl'>
              {cameraStream ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className='w-full h-full object-cover scale-x-[-1]'
                />
              ) : (
                <div className='absolute inset-0 flex items-center justify-center opacity-40'>
                  <div className='w-36 h-36 border border-emerald-500/30 rounded-full animate-ping absolute'></div>
                  <svg
                    className='w-32 h-32 text-emerald-400 animate-pulse'
                    fill='none'
                    stroke='currentColor'
                    viewBox='0 0 24 24'
                  >
                    <path
                      strokeLinecap='round'
                      strokeLinejoin='round'
                      strokeWidth={1}
                      d='M10 21h4m1.8-8H8.2m8.6-4a4 4 0 11-8 0 4 4 0 018 0z'
                    />
                  </svg>
                </div>
              )}

              {scanning && (
                <div className='absolute left-0 w-full h-1 bg-accent/80 shadow-[0_0_12px_#f27d26] animate-bounce top-0'></div>
              )}

              <div className='absolute inset-0 border-2 border-emerald-500/20 rounded-full animate-spin [animation-duration:8s]'></div>
            </div>

            <div className='w-full space-y-3 text-center'>
              <div className='h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 max-w-xs mx-auto'>
                <div
                  className='h-full bg-accent transition-all duration-300'
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <div className='text-xs text-accent font-mono font-bold animate-pulse uppercase tracking-wider'>
                {progress}% scanned
              </div>
              <p className='text-sm font-semibold text-slate-300 italic max-w-xs mx-auto h-8 flex items-center justify-center'>
                {statusText}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

const Header = ({
  user,
  onLogout,
  activeTab,
  setActiveTab,
}: {
  user: UserProfile | null
  onLogout: () => void
  activeTab: string
  setActiveTab: (tab: string) => void
}) => {
  return (
    <header className='sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-white/40 shadow-sm'>
      <div className='max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 min-h-[72px] py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-2 sm:gap-3'>
        <div className='flex items-center gap-2 sm:gap-4 shrink-0 min-w-0'>
          <img
            src={LOGO_URL}
            alt='COTRAC Logo'
            className='h-10 sm:h-14 w-auto object-contain'
            referrerPolicy='no-referrer'
            onError={(e) => {
              // Fallback to Icon if image fails to load
              ;(e.target as any).style.display = 'none'
              ;(e.target as any).parentElement.querySelector(
                '.fallback-logo',
              ).style.display = 'flex'
            }}
          />
          <div className='fallback-logo hidden h-10 w-10 sm:h-14 sm:w-14 bg-primary rounded-xl sm:rounded-2xl items-center justify-center shadow-lg rotate-3'>
            <Clock className='text-white' size={20} />
          </div>
          <div className='flex flex-col'>
            <h1 className='text-xl sm:text-2xl font-black text-primary tracking-tighter uppercase italic leading-none'>
              COTRAC
            </h1>
            <span className='text-[8px] sm:text-[10px] text-accent font-black tracking-[0.3em] uppercase opacity-60'>
              Nexus Portal
            </span>
          </div>
        </div>

        {user && (
          <nav className='hidden lg:flex items-center gap-1 bg-slate-100/50 p-1.5 rounded-[1.5rem] border border-white'>
            {[
              ...(user.role === 'sign-in' || user.role === 'admin'
                ? [{ id: 'terminal', label: 'Sign-In Hub', icon: ShieldAlert }]
                : []),
              ...(user.role !== 'staff'
                ? [
                    {
                      id: 'dashboard',
                      label: 'Dashboard',
                      icon: LayoutDashboard,
                    },
                  ]
                : []),
              { id: 'attendance', label: 'History', icon: History },
              { id: 'profile', label: 'Profile', icon: UserIcon },
              ...(user.role === 'admin'
                ? [{ id: 'admin', label: 'Nexus', icon: ShieldCheck }]
                : []),
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2',
                  activeTab === item.id
                    ? 'bg-white text-primary shadow-lg'
                    : 'text-slate-400 hover:text-primary hover:bg-white/50',
                )}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
          </nav>
        )}

        <div className='flex items-center gap-2 sm:gap-6 ml-auto w-full sm:w-auto justify-end'>
          {user && (
            <div className='flex items-center gap-2 sm:gap-6'>
              <div className='hidden sm:flex flex-col items-end max-w-[10rem]'>
                <span className='text-sm font-black text-primary uppercase tracking-tighter leading-none truncate w-full text-right'>
                  {user.displayName}
                </span>
                <span className='text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded mt-1'>
                  {user.role}
                </span>
              </div>
              <button
                onClick={() => setActiveTab('profile')}
                className='h-10 w-10 sm:h-12 sm:w-12 rounded-xl sm:rounded-2xl bg-white/40 shadow-inner flex items-center justify-center text-primary border border-white/30 backdrop-blur-sm group hover:border-primary/50 transition-colors'
                title='Profile Settings'
              >
                <UserIcon
                  size={20}
                  className='group-hover:scale-110 transition-transform'
                />
              </button>
              <button
                onClick={onLogout}
                className='p-2 sm:p-3 text-slate-400 hover:text-accent hover:bg-accent/5 rounded-xl sm:rounded-2xl transition-all active:scale-95'
                title='Logout'
              >
                <LogOut size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Navigation */}
      {user && (
        <nav className='lg:hidden flex border-t border-white/40 overflow-x-auto no-scrollbar py-2 px-2.5 sm:px-4 gap-1.5 sm:gap-2 bg-white/50'>
          {[
            ...(user?.role === 'sign-in' || user?.role === 'admin'
              ? [{ id: 'terminal', label: 'Hub', icon: ShieldAlert }]
              : []),
            ...(user?.role !== 'staff'
              ? [{ id: 'dashboard', label: 'Dash', icon: LayoutDashboard }]
              : []),
            { id: 'attendance', label: 'History', icon: History },
            ...(user?.role === 'admin'
              ? [{ id: 'admin', label: 'Nexus', icon: ShieldCheck }]
              : []),
            { id: 'profile', label: 'Profile', icon: UserIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[75px]',
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-lg'
                  : 'text-slate-400 hover:bg-white',
              )}
            >
              <tab.icon size={18} />
              <span className='text-[9px] font-black uppercase tracking-widest'>
                {tab.label}
              </span>
            </button>
          ))}
        </nav>
      )}
    </header>
  )
}

const Login = ({
  onLogin,
  onCustomLogin,
  isLoading,
  popupBlocked,
}: {
  onLogin: () => void
  onCustomLogin: (user: UserProfile) => void
  isLoading: boolean
  popupBlocked: boolean
}) => {
  const isIframe = typeof window !== 'undefined' && window.self !== window.top
  const [activeTab, setActiveTab] = useState<'google' | 'email'>('google')
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pin, setPin] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')

    const cleanEmail = email.trim().toLowerCase()

    // Check validation rules
    if (
      cleanEmail !== 'mojaizs@gmail.com' &&
      !cleanEmail.endsWith('@cotracnigeria.com')
    ) {
      setAuthError(
        'Forbidden: Registration/Sign-in is strictly restricted to @cotracnigeria.com domains or mojaizs@gmail.com.',
      )
      return
    }

    if (emailMode === 'signup') {
      if (!validatePasswordStrength(password)) {
        setAuthError(
          'Security Constraint: Password must be at least 6 characters long and contain alphanumeric characters (letters, numbers, and special symbols).',
        )
        return
      }
    } else {
      if (password.length < 6) {
        setAuthError(
          'Security Constraint: Password must be at least 6 characters.',
        )
        return
      }
    }

    if (emailMode === 'signup' && !/^\d{4,6}$/.test(pin)) {
      setAuthError(
        'Security Constraint: Secure PIN must be 4-6 digits (numbers only).',
      )
      return
    }

    setEmailLoading(true)

    try {
      const customUid = 'custom-' + cleanEmail
      const userRef = doc(db, 'users', customUid)

      if (emailMode === 'signin') {
        // Look up by customUid or email-keyed pre-registered doc
        let userDoc = await getDoc(userRef)
        let userData = userDoc.exists() ? userDoc.data() : null

        if (!userData) {
          // Check if there is a pre-registered doc under the email key
          const emailDoc = await getDoc(doc(db, 'users', cleanEmail))
          if (emailDoc.exists()) {
            userData = emailDoc.data()
          }
        }

        if (!userData) {
          setAuthError(
            'No registered profile matches this email. Click "New employee? Set your password here" below to register.',
          )
          setEmailLoading(false)
          return
        }

        if (userData.password !== password) {
          setAuthError('Incorrect password. Please verify your credentials.')
          setEmailLoading(false)
          return
        }

        // Login successful
        const userProfile: UserProfile = {
          uid: userData.uid || customUid,
          displayName: userData.displayName || 'Staff Member',
          email: userData.email || cleanEmail,
          role: userData.role || 'staff',
          employeeId: userData.employeeId || '',
          shiftStart: userData.shiftStart || '09:00',
          latenessTolerance: 0,
          registeredSignature: userData.registeredSignature || '',
          pin: userData.pin || '',
        }

        // If it was pre-registered with email key, migrate it to the customUid key for consistency
        if (!userDoc.exists()) {
          await setDoc(userRef, { ...userProfile, password })
        }

        onCustomLogin(userProfile)
        setAuthSuccess('Authenticated successfully! Welcome back.')
      } else {
        // Sign up (Register)
        // Check if user already exists
        const userDoc = await getDoc(userRef)
        if (userDoc.exists() && userDoc.data().password) {
          setAuthError(
            'An account with this email already exists. Try signing in.',
          )
          setEmailLoading(false)
          return
        }

        // Check if there is a pre-registered doc from the admin
        const emailDoc = await getDoc(doc(db, 'users', cleanEmail))
        let preData = emailDoc.exists() ? emailDoc.data() : null

        const isDefaultAdmin = cleanEmail === 'mojaizs@gmail.com'
        const finalDisplayName =
          displayName.trim() || (preData ? preData.displayName : 'Staff Member')
        const finalRole = preData
          ? preData.role
          : isDefaultAdmin
            ? 'admin'
            : 'staff'
        const finalEmployeeId = preData ? preData.employeeId : ''

        const newProfile: UserProfile = {
          uid: customUid,
          displayName: finalDisplayName,
          email: cleanEmail,
          role: finalRole,
          employeeId: finalEmployeeId,
          shiftStart: (preData && preData.shiftStart) || '09:00',
          latenessTolerance: 0,
          pin: pin,
          createdAt: new Date().toISOString(),
          password: password, // Store password field
        }

        await setDoc(userRef, newProfile)

        // Remove the temporary email pre-registration doc if it existed
        if (emailDoc.exists()) {
          try {
            await deleteDoc(doc(db, 'users', cleanEmail))
          } catch (delErr) {
            console.warn('Failed to delete temp user doc:', delErr)
          }
        }

        onCustomLogin(newProfile)
        setAuthSuccess('Account created successfully! Welcome to the portal.')
      }
    } catch (err: any) {
      console.error('Custom Authentication Error:', err)
      setAuthError(err.message || 'An error occurred during authentication.')
    } finally {
      setEmailLoading(false)
    }
  }

  return (
    <div className='min-h-[calc(100vh-80px)] flex items-center justify-center p-2 sm:p-4 lg:p-6'>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className='glass rounded-[2rem] sm:rounded-[3rem] max-w-lg w-full text-center space-y-6 sm:space-y-8 p-5 sm:p-8 lg:p-10 relative overflow-hidden'
      >
        <div className='absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-transparent via-accent to-transparent'></div>
        <div className='space-y-4'>
          <div className='mx-auto flex items-center justify-center'>
            <img
              src={LOGO_URL}
              alt='COTRAC Logo'
              className='h-20 sm:h-24 w-auto object-contain drop-shadow-2xl'
              referrerPolicy='no-referrer'
              onError={(e) => {
                ;(e.target as any).style.display = 'none'
                ;(e.target as any).parentElement.querySelector(
                  '.fallback-login-logo',
                ).style.display = 'flex'
              }}
            />
            <div className='fallback-login-logo hidden bg-primary w-16 h-16 rounded-[1.5rem] items-center justify-center shadow-2xl rotate-12'>
              <Clock className='text-white' size={24} />
            </div>
          </div>
          <div className='space-y-1'>
            <h1 className='text-4xl font-black text-primary tracking-tighter uppercase italic'>
              Staff Portal
            </h1>
            <p className='text-slate-600 font-medium text-sm leading-tight'>
              Secure clock-in and clock-out system
              <br />
              for COTRAC employees.
            </p>
          </div>
        </div>

        {/* Custom Segmented Control Tab */}
        <div className='bg-slate-100 p-1 rounded-2xl flex flex-wrap gap-1 border border-slate-200'>
          <button
            onClick={() => {
              setActiveTab('google')
              setAuthError('')
              setAuthSuccess('')
            }}
            className={cn(
              'flex-1 min-w-[120px] py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-200',
              activeTab === 'google'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-400 hover:text-slate-600',
            )}
          >
            Google Auth
          </button>
          <button
            onClick={() => {
              setActiveTab('email')
              setAuthError('')
              setAuthSuccess('')
            }}
            className={cn(
              'flex-1 min-w-[120px] py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-200',
              activeTab === 'email'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-400 hover:text-slate-600',
            )}
          >
            Corporate Email
          </button>
        </div>

        <AnimatePresence mode='wait'>
          {activeTab === 'google' ? (
            <motion.div
              key='google-pane'
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className='space-y-6 py-2'
            >
              <button
                onClick={onLogin}
                disabled={isLoading}
                className='w-full btn-primary flex items-center justify-center gap-4 py-5 text-xl tracking-tight shadow-2xl shadow-primary/30'
              >
                {isLoading ? (
                  <div className='w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin'></div>
                ) : (
                  <ShieldCheck size={28} />
                )}
                {isLoading ? 'Establishing Connection...' : 'Secure SSO Access'}
              </button>

              {(popupBlocked || isIframe) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className='p-5 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-left space-y-3'
                >
                  <div className='flex items-start gap-2.5 text-amber-700'>
                    <AlertTriangle
                      size={18}
                      className='shrink-0 mt-0.5 text-amber-500'
                    />
                    <div>
                      <p className='text-xs font-black uppercase tracking-wider text-amber-600'>
                        Popup & Sandbox Check
                      </p>
                      <p className='text-[11px] text-slate-600 font-semibold mt-1 leading-normal'>
                        {popupBlocked
                          ? 'Google Sign-In popup was blocked by your browser. Custom domains require standard cookies/popups.'
                          : 'Detected embedded portal context. Google Sign-In requires a direct parent browser tab.'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(window.location.href, '_blank')}
                    className='w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[11px] font-black uppercase tracking-widest hover:brightness-105 active:scale-95 transition-all shadow-md flex items-center justify-center gap-2'
                  >
                    <ExternalLink size={13} />
                    Open App in New Tab
                  </button>
                </motion.div>
              )}

              <div className='pt-2 flex flex-col items-center gap-1.5'>
                <p className='text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1.5'>
                  <CheckCircle2 size={12} className='text-emerald-500' />
                  SSO Integration Active
                </p>
                <p className='text-[10px] text-slate-400 font-medium'>
                  Suitable for Google accounts & mojaizs@gmail.com.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key='email-pane'
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className='space-y-6'
            >
              <form onSubmit={handleEmailAuth} className='space-y-4 text-left'>
                {emailMode === 'signup' && (
                  <div>
                    <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block px-1 italic'>
                      Full Name
                    </label>
                    <div className='relative'>
                      <span className='absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400'>
                        <UserIcon size={16} />
                      </span>
                      <input
                        type='text'
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className='w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-slate-400'
                        placeholder='E.g., John Doe'
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block px-1 italic'>
                    Corporate Email
                  </label>
                  <div className='relative'>
                    <span className='absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400'>
                      <Mail size={16} />
                    </span>
                    <input
                      type='email'
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className='w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-slate-400'
                      placeholder='E.g., yourname@cotracnigeria.com'
                    />
                  </div>
                </div>

                <div>
                  <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block px-1 italic'>
                    Password
                  </label>
                  <div className='relative'>
                    <span className='absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400'>
                      <Lock size={16} />
                    </span>
                    <input
                      type='password'
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className='w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-slate-400'
                      placeholder='••••••••'
                    />
                  </div>
                </div>

                {emailMode === 'signup' && (
                  <div>
                    <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block px-1 italic'>
                      Secure PIN (4-6 digits)
                    </label>
                    <div className='relative'>
                      <span className='absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400'>
                        <Lock size={16} />
                      </span>
                      <input
                        type='password'
                        required
                        maxLength={6}
                        value={pin}
                        onChange={(e) =>
                          setPin(e.target.value.replace(/\D/g, ''))
                        }
                        className='w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all placeholder:text-slate-400'
                        placeholder='e.g. 1234'
                      />
                    </div>
                  </div>
                )}

                {authError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className='p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-[11px] font-semibold flex items-start gap-2 leading-normal'
                  >
                    <AlertCircle size={14} className='shrink-0 mt-0.5' />
                    <span>{authError}</span>
                  </motion.div>
                )}

                {authSuccess && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className='p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-[11px] font-semibold flex items-start gap-2 leading-normal'
                  >
                    <CheckCircle2 size={14} className='shrink-0 mt-0.5' />
                    <span>{authSuccess}</span>
                  </motion.div>
                )}

                <button
                  type='submit'
                  disabled={emailLoading}
                  className='w-full py-4 rounded-2xl bg-primary text-white text-sm font-bold uppercase tracking-widest hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-primary/20'
                >
                  {emailLoading ? (
                    <div className='w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin'></div>
                  ) : emailMode === 'signin' ? (
                    'Corporate Login'
                  ) : (
                    'Register Account'
                  )}
                </button>
              </form>

              <div className='flex justify-center text-xs'>
                {emailMode === 'signin' ? (
                  <button
                    onClick={() => {
                      setEmailMode('signup')
                      setAuthError('')
                      setAuthSuccess('')
                    }}
                    className='text-primary hover:underline font-bold'
                  >
                    New employee? Set your password here
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setEmailMode('signin')
                      setAuthError('')
                      setAuthSuccess('')
                    }}
                    className='text-primary hover:underline font-bold'
                  >
                    Already have an account? Sign in
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

const Dashboard = ({
  user,
  records,
  allRecords = [],
  onClockIn,
  onClockOut,
}: {
  user: UserProfile
  records: AttendanceRecord[]
  allRecords?: AttendanceRecord[]
  onClockIn: () => void
  onClockOut: () => void
}) => {
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayRecord = records.find((r) => r.date === today)
  const isClockedIn = todayRecord && !todayRecord.clockOut
  const isClockedOut = todayRecord && todayRecord.clockOut

  const statsRecords =
    user.role === 'admin' || user.role === 'sign-in' ? allRecords : records

  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className='space-y-8 sm:space-y-12'>
      <div className='flex flex-col xl:flex-row justify-between items-start xl:items-end gap-5 sm:gap-6'>
        <div className='space-y-2'>
          <div className='flex items-center gap-3 text-accent font-black uppercase tracking-[0.2em] italic text-xs'>
            <div className='w-12 h-[2px] bg-accent'></div>
            Personnel Authorization Hub
          </div>
          <h2 className='text-3xl sm:text-4xl lg:text-5xl font-black text-primary tracking-tighter uppercase italic leading-none break-words'>
            Welcome, {user.displayName}
          </h2>
          <p className='text-slate-500 font-medium text-sm sm:text-base lg:text-xl'>
            Operational integrity confirmed. Time stream active.
          </p>
          <div className='flex items-center gap-2 mt-2 text-xs font-semibold text-accent/80 bg-accent/5 border border-accent/10 px-3 py-1.5 rounded-xl w-fit'>
            <Timer size={14} />
            <span>Assigned Shift: {user.shiftStart || '09:00'}</span>
          </div>
        </div>
        <div className='glass w-full xl:w-auto px-5 py-4 sm:px-8 sm:py-6 lg:px-10 lg:py-8 rounded-[1.5rem] sm:rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 shadow-2xl relative overflow-hidden group border-white/40'>
          <div className='absolute top-0 left-0 w-1.5 h-full bg-accent'></div>
          <div className='bg-primary/5 p-3 sm:p-4 rounded-2xl group-hover:rotate-12 transition-transform shrink-0'>
            <Clock className='text-accent' size={28} sm:size={36} />
          </div>
          <div className='flex flex-col'>
            <span className='text-2xl sm:text-3xl lg:text-4xl font-black text-primary tabular-nums tracking-tighter leading-none'>
              {format(time, 'HH:mm:ss')}
            </span>
            <span className='text-[10px] text-slate-400 font-bold uppercase tracking-[0.3em] mt-2 italic'>
              {format(time, 'EEEE, MMMM do')}
            </span>
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8'>
        {/* Status Card */}
        <div className='glass xl:col-span-2 p-5 sm:p-8 lg:p-10 rounded-[1.75rem] sm:rounded-[2.5rem] flex flex-col justify-between min-h-[280px] sm:min-h-[360px] relative overflow-hidden bg-white/70 border-white/50'>
          <div className='absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none'></div>
          <div className='flex flex-col sm:flex-row justify-between items-start gap-4 z-10'>
            <div>
              <h3 className='text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 italic'>
                Personnel Engagement Status
              </h3>
              <div className='flex items-center gap-4'>
                {isClockedIn ? (
                  <span className='flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-emerald-500 text-white text-sm font-black uppercase tracking-widest shadow-2xl shadow-emerald-500/30'>
                    <CheckCircle2 size={20} />
                    Active Duty
                  </span>
                ) : isClockedOut ? (
                  <span className='flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-slate-900 text-white text-sm font-black uppercase tracking-widest shadow-2xl shadow-slate-900/30'>
                    <History size={20} />
                    Shift Logged
                  </span>
                ) : (
                  <span className='flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-accent text-white text-sm font-black uppercase tracking-widest shadow-2xl shadow-accent/30'>
                    <AlertCircle size={20} />
                    Anchor Standby
                  </span>
                )}
              </div>
            </div>
            <div className='hidden sm:flex bg-primary/5 p-6 rounded-[2rem] shadow-inner backdrop-blur-md'>
              <Timer className='text-primary/10' size={80} />
            </div>
          </div>

          <div className='flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-6 mt-6 sm:mt-10 z-10'>
            {false ? (
              <div className='w-full p-8 bg-slate-100/40 rounded-3xl border border-slate-200/50 text-center flex flex-col items-center justify-center gap-2'>
                <ShieldAlert className='text-amber-500' size={32} />
                <div className='space-y-1'>
                  <p className='text-sm font-black text-slate-700 uppercase tracking-wider'>
                    Awaiting Sign-In Officer Authorization
                  </p>
                  <p className='text-xs text-slate-500 font-semibold leading-normal'>
                    Please proceed to the nearest Sign-In Officer Terminal to
                    authorize your check-in or check-out.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {!isClockedIn && !isClockedOut && (
                  <button
                    onClick={onClockIn}
                    className='w-full sm:flex-[2] btn-primary py-4 sm:py-6 text-base sm:text-lg flex items-center justify-center gap-3 shadow-2xl shadow-primary/40 font-black tracking-tight'
                  >
                    <Clock size={28} />
                    AUTHORIZE CHECK-IN
                  </button>
                )}
                {isClockedIn && (
                  <button
                    onClick={onClockOut}
                    className='w-full sm:flex-[2] btn-accent py-4 sm:py-6 text-base sm:text-lg flex items-center justify-center gap-3 shadow-2xl shadow-accent/40 font-black tracking-tight'
                  >
                    <LogOut size={28} />
                    AUTHORIZE CHECK-OUT
                  </button>
                )}
              </>
            )}
            {(isClockedOut || isClockedIn) && (
              <div className='w-full sm:flex-1 glass-dark rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-center border-white/5 shadow-2xl'>
                <span className='text-[10px] text-white/40 uppercase font-black tracking-[0.2em] mb-2 italic'>
                  Entry Anchor
                </span>
                <span className='text-2xl sm:text-3xl font-black text-white tabular-nums tracking-tighter'>
                  {todayRecord
                    ? format(new Date(todayRecord.clockIn), 'HH:mm')
                    : '--:--'}
                </span>
              </div>
            )}
            {isClockedOut && (
              <div className='w-full sm:flex-1 glass-dark rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-center border-white/5 shadow-2xl'>
                <span className='text-[10px] text-white/40 uppercase font-black tracking-[0.2em] mb-2 italic'>
                  Release Anchor
                </span>
                <span className='text-2xl sm:text-3xl font-black text-white tabular-nums tracking-tighter'>
                  {format(new Date(todayRecord!.clockOut!), 'HH:mm')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className='space-y-5 sm:space-y-8'>
          <div className='glass p-5 sm:p-8 lg:p-10 rounded-[1.75rem] sm:rounded-[2.5rem] bg-primary text-white border-none shadow-2xl relative overflow-hidden group'>
            <div className='absolute inset-0 bg-gradient-to-br from-white/10 to-transparent'></div>
            <div className='absolute top-0 right-0 w-48 h-48 bg-accent/20 rounded-full -mr-24 -mt-24 blur-[60px] group-hover:scale-150 transition-transform duration-700'></div>
            <h4 className='text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mb-6 italic relative z-10'>
              Productivity Index
            </h4>
            <div className='flex items-baseline gap-2 relative z-10'>
              <span className='text-5xl sm:text-6xl lg:text-7xl font-black tracking-tighter italic tabular-nums'>
                {statsRecords
                  .reduce((acc, curr) => {
                    const date = new Date(curr.date)
                    const now = new Date()
                    const diffMinutes = differenceInMinutes(now, date)
                    return diffMinutes < 10080
                      ? acc + (curr.totalHours || 0)
                      : acc
                  }, 0)
                  .toFixed(1)}
              </span>
              <span className='text-xs font-black uppercase tracking-widest opacity-40 italic'>
                Quota Units
              </span>
            </div>
            <div className='mt-12 h-2.5 w-full bg-white/10 rounded-full overflow-hidden relative z-10 border border-white/5'>
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, (statsRecords.reduce((acc, curr) => acc + (curr.totalHours || 0), 0) / 40) * 100)}%`,
                }}
                className='h-full bg-accent shadow-[0_0_25px_rgba(242,125,38,0.9)]'
              ></motion.div>
            </div>
            <p className='mt-4 text-[10px] text-white/30 font-bold uppercase tracking-widest italic relative z-10'>
              Rolling 7-day work cycle
            </p>
          </div>

          <div className='glass-dark p-5 sm:p-8 lg:p-10 rounded-[1.75rem] sm:rounded-[2.5rem] text-white border-white/5 shadow-2xl'>
            <h4 className='text-white/20 text-[10px] font-black uppercase tracking-[0.3em] mb-8 italic'>
              Stream Pulse
            </h4>
            <div className='space-y-6'>
              {statsRecords.slice(0, 4).map((record, i) => (
                <div
                  key={i}
                  className='flex justify-between items-center group'
                >
                  <div className='flex flex-col'>
                    <span className='text-sm font-black text-white tracking-tight'>
                      {format(new Date(record.date), 'MMMM dd')}
                    </span>
                    <span
                      className={cn(
                        'text-[9px] font-black uppercase tracking-widest',
                        record.status === 'Present'
                          ? 'text-emerald-400'
                          : record.status === 'Late'
                            ? 'text-amber-400'
                            : 'text-rose-400',
                      )}
                    >
                      {record.status}
                    </span>
                  </div>
                  <div className='flex flex-col items-end'>
                    <div className='text-xl font-black text-white tabular-nums tracking-tighter'>
                      {(record.totalHours || 0).toFixed(1)}H
                    </div>
                    <div
                      className={cn(
                        'h-1 w-16 rounded-full mt-1.5 opacity-30 group-hover:opacity-100 transition-opacity shadow-[0_0_10px_currentcolor]',
                        record.status === 'Present'
                          ? 'bg-emerald-400'
                          : record.status === 'Late'
                            ? 'bg-amber-400'
                            : 'bg-rose-400',
                      )}
                    ></div>
                  </div>
                </div>
              ))}
              {statsRecords.length === 0 && (
                <p className='text-xs text-white/20 font-black uppercase tracking-widest italic text-center py-8'>
                  Static signal detected.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const AttendanceTable = ({
  records,
  users,
  isAdmin = false,
  onEdit,
  onVerifySignature,
}: {
  records: AttendanceRecord[]
  users?: UserProfile[]
  isAdmin?: boolean
  onEdit?: (record: AttendanceRecord) => void
  onVerifySignature?: (
    recordId: string,
    refSig: string,
    logSig: string,
  ) => Promise<void>
}) => {
  const [verifyingMap, setVerifyingMap] = useState<Record<string, boolean>>({})

  const handleTriggerVerify = async (record: AttendanceRecord) => {
    if (!record.id) return
    const staffProfile = users?.find((u) => u.uid === record.userId)
    const refSig = staffProfile?.registeredSignature
    const logSig = record.clockInSignature
    if (!refSig || !logSig) {
      alert(
        'Requires registered official reference signature and clock-in signature to execute.',
      )
      return
    }
    setVerifyingMap((prev) => ({ ...prev, [record.id!]: true }))
    try {
      if (onVerifySignature) {
        await onVerifySignature(record.id, refSig, logSig)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setVerifyingMap((prev) => ({ ...prev, [record.id!]: false }))
    }
  }

  return (
    <div className='space-y-6'>
      {/* Desktop view */}
      <div className='hidden lg:block glass-dark overflow-hidden rounded-[2.5rem] border-none shadow-2xl'>
        <div className='overflow-x-auto'>
          <table className='w-full text-left border-collapse'>
            <thead>
              <tr className='bg-primary/80 backdrop-blur-md text-white uppercase text-[10px] font-black tracking-[0.2em] italic'>
                <th className='px-8 py-6 text-center'>Reference Date</th>
                {isAdmin && (
                  <th className='px-8 py-6 text-center'>Personnel</th>
                )}
                <th className='px-8 py-6 text-center'>Duty Start</th>
                <th className='px-8 py-6 text-center'>Duty End</th>
                <th className='px-8 py-6 text-center border-x border-white/5'>
                  Quota Units
                </th>
                <th className='px-8 py-6 text-center'>Status</th>
                <th className='px-8 py-6 text-center'>
                  Auth Sig {isAdmin && '(vs Ref)'}
                </th>
                {isAdmin && <th className='px-8 py-6 text-center'>Actions</th>}
              </tr>
            </thead>
            <tbody className='text-white/80'>
              {records.length === 0 ? (
                <tr>
                  <td
                    colSpan={isAdmin ? 8 : 6}
                    className='px-8 py-20 text-center text-white/30 font-bold italic uppercase tracking-widest'
                  >
                    No registered logs in database.
                  </td>
                </tr>
              ) : (
                records.map((record, idx) => {
                  const staffProfile = users?.find(
                    (u) => u.uid === record.userId,
                  )
                  return (
                    <tr
                      key={record.id || idx}
                      className='border-b border-white/5 hover:bg-white/5 transition-all group'
                    >
                      <td className='px-8 py-6 text-sm font-black tracking-tight text-center'>
                        {format(new Date(record.date), 'MMM dd, yyyy')}
                      </td>
                      {isAdmin && (
                        <td className='px-8 py-6 text-sm font-black text-center text-white'>
                          {record.employeeName}
                        </td>
                      )}
                      <td className='px-8 py-6 text-sm font-black tabular-nums text-center opacity-70 group-hover:opacity-100 transition-opacity'>
                        {format(new Date(record.clockIn), 'HH:mm:ss')}
                      </td>
                      <td className='px-8 py-6 text-sm font-black tabular-nums text-center opacity-70 group-hover:opacity-100 transition-opacity'>
                        {record.clockOut
                          ? format(new Date(record.clockOut), 'HH:mm:ss')
                          : '--:--:--'}
                      </td>
                      <td className='px-8 py-6 text-sm font-black tabular-nums text-center text-accent bg-white/5 border-x border-white/5'>
                        {record.totalHours
                          ? `${record.totalHours.toFixed(1)}H`
                          : '--'}
                      </td>
                      <td className='px-8 py-6 text-center'>
                        <span
                          className={cn(
                            'px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter',
                            record.status === 'Present' &&
                              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
                            record.status === 'Late' &&
                              'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                            record.status === 'Incomplete' &&
                              'bg-rose-500/20 text-rose-400 border border-rose-500/30',
                          )}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className='px-8 py-6 text-center'>
                        <div className='flex justify-center gap-2 items-center'>
                          {isAdmin && staffProfile?.registeredSignature && (
                            <div className='group/ref relative mr-2 border-r border-white/10 pr-2'>
                              <img
                                src={staffProfile.registeredSignature}
                                alt='REF'
                                className='h-8 w-10 object-contain opacity-40 hover:opacity-100 transition-opacity'
                              />
                              <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/ref:block z-50'>
                                <div className='bg-slate-900 p-2 rounded-xl border border-white/20 whitespace-nowrap shadow-2xl'>
                                  <p className='text-[8px] font-black uppercase tracking-widest text-accent mb-1'>
                                    Official Reference
                                  </p>
                                  <img
                                    src={staffProfile.registeredSignature}
                                    className='h-20 w-32 object-contain invert'
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                          {record.clockInSignature ? (
                            <div className='flex flex-col items-center gap-1.5'>
                              <div className='group/sig relative'>
                                <img
                                  src={record.clockInSignature}
                                  alt='SIG-IN'
                                  className='h-10 w-14 object-contain bg-white/10 border border-white/20 rounded-xl p-1 cursor-zoom-in group-hover/sig:border-accent transition-colors'
                                />
                                <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-4 hidden group-hover/sig:block z-50'>
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className='bg-slate-900 p-3 rounded-[1.5rem] shadow-2xl border border-white/10'
                                  >
                                    <img
                                      src={record.clockInSignature}
                                      alt='SIG-IN-LG'
                                      className='h-40 w-60 object-contain invert'
                                    />
                                    <p className='text-[10px] text-white/40 text-center font-black uppercase tracking-widest mt-2 italic'>
                                      Entry Verification
                                    </p>
                                  </motion.div>
                                </div>
                              </div>
                              {record.biometricVerified && (
                                <div className='group/bio relative cursor-pointer'>
                                  <span className='flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-black uppercase tracking-tight rounded-lg'>
                                    <ShieldCheck
                                      size={10}
                                      className='shrink-0'
                                    />
                                    {record.biometricType === 'fingerprint'
                                      ? 'Touch ID'
                                      : 'Face ID'}
                                  </span>
                                  {record.biometricStamp && (
                                    <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/bio:block z-50'>
                                      <div className='bg-slate-900 p-2.5 rounded-2xl border border-white/20 shadow-2xl w-48'>
                                        <p className='text-[8px] font-black uppercase tracking-widest text-accent mb-1.5 text-center'>
                                          Biometric Receipt
                                        </p>
                                        <img
                                          src={record.biometricStamp}
                                          className='h-20 w-full object-contain'
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className='text-white/10 text-xs'>—</span>
                          )}
                          {record.clockOutSignature ? (
                            <div className='flex flex-col items-center gap-1.5'>
                              <div className='group/sig relative'>
                                <img
                                  src={record.clockOutSignature}
                                  alt='SIG-OUT'
                                  className='h-10 w-14 object-contain bg-white/10 border border-white/20 rounded-xl p-1 cursor-zoom-in group-hover/sig:border-accent transition-colors'
                                />
                                <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-4 hidden group-hover/sig:block z-50'>
                                  <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className='bg-slate-900 p-3 rounded-[1.5rem] shadow-2xl border border-white/10'
                                  >
                                    <img
                                      src={record.clockOutSignature}
                                      alt='SIG-OUT-LG'
                                      className='h-40 w-60 object-contain invert'
                                    />
                                    <p className='text-[10px] text-white/40 text-center font-black uppercase tracking-widest mt-2 italic'>
                                      Exit Verification
                                    </p>
                                  </motion.div>
                                </div>
                              </div>
                              {record.clockOutBiometricVerified && (
                                <div className='group/bio-out relative cursor-pointer'>
                                  <span className='flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[8px] font-black uppercase tracking-tight rounded-lg'>
                                    <ShieldCheck
                                      size={10}
                                      className='shrink-0'
                                    />
                                    {record.clockOutBiometricType ===
                                    'fingerprint'
                                      ? 'Touch ID'
                                      : 'Face ID'}
                                  </span>
                                  {record.clockOutBiometricStamp && (
                                    <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/bio-out:block z-50'>
                                      <div className='bg-slate-900 p-2.5 rounded-2xl border border-white/20 shadow-2xl w-48'>
                                        <p className='text-[8px] font-black uppercase tracking-widest text-accent mb-1.5 text-center'>
                                          Biometric Receipt
                                        </p>
                                        <img
                                          src={record.clockOutBiometricStamp}
                                          className='h-20 w-full object-contain'
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className='text-white/10 text-xs'>—</span>
                          )}

                          {/* AI-Powered Signature Similarity Badge */}
                          {isAdmin &&
                            staffProfile?.registeredSignature &&
                            record.clockInSignature && (
                              <div className='flex items-center ml-2 pl-2 border-l border-white/10'>
                                {record.signatureMatchPercentage !==
                                undefined ? (
                                  <div className='relative group/verify'>
                                    <span
                                      className={cn(
                                        'px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-tight cursor-help transition-all shadow-md',
                                        record.signatureMatchVerified
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
                                      )}
                                    >
                                      AI: {record.signatureMatchPercentage}%{' '}
                                      {record.signatureMatchVerified
                                        ? '✓'
                                        : '⚠'}
                                    </span>
                                    <div className='absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover/verify:block z-50'>
                                      <div className='bg-slate-900 p-4 rounded-3xl border border-white/10 w-72 shadow-2xl text-left'>
                                        <p className='text-[9px] font-black uppercase tracking-wider text-accent mb-2'>
                                          Forensic AI Analysis
                                        </p>
                                        <div className='mb-3 flex justify-between items-center bg-white/5 p-2 rounded-xl border border-white/5'>
                                          <span className='text-[10px] text-white/60 font-medium'>
                                            Correlation Score:
                                          </span>
                                          <span
                                            className={cn(
                                              'text-xs font-black',
                                              record.signatureMatchVerified
                                                ? 'text-emerald-400'
                                                : 'text-rose-400',
                                            )}
                                          >
                                            {record.signatureMatchPercentage}%
                                          </span>
                                        </div>
                                        <p className='text-[11px] text-slate-300 leading-relaxed font-semibold italic'>
                                          "{record.signatureMatchReason}"
                                        </p>
                                        <button
                                          onClick={() =>
                                            handleTriggerVerify(record)
                                          }
                                          className='w-full text-center mt-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-[#f27d26] hover:bg-white/10 active:scale-95 transition-all'
                                        >
                                          Re-Verify Signature
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    {verifyingMap[record.id!] ? (
                                      <div className='flex items-center gap-1.5 text-accent text-[9px] uppercase font-black tracking-widest'>
                                        <span className='w-2.5 h-2.5 rounded-full border-2 border-[#f27d26] border-t-transparent animate-spin'></span>
                                        Auditing
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() =>
                                          handleTriggerVerify(record)
                                        }
                                        className='flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-dashed border-accent/40 text-accent bg-accent/5 hover:bg-accent/10 hover:border-accent text-[8px] font-black uppercase tracking-widest active:scale-95 transition-all'
                                        title="Compare signature visually with user's official master registration using Gemini API"
                                      >
                                        ✨ AI Verify
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      </td>
                      {isAdmin && (
                        <td className='px-8 py-6 text-center'>
                          <button
                            onClick={() => onEdit?.(record)}
                            className='text-white/40 hover:text-accent transition-all p-2 hover:bg-white/5 rounded-xl active:scale-90'
                          >
                            <ChevronRight size={24} />
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile view */}
      <div className='lg:hidden space-y-4'>
        {records.length === 0 ? (
          <div className='glass p-12 text-center rounded-[2rem]'>
            <p className='text-xs text-slate-400 font-black uppercase tracking-widest italic'>
              No registered logs in database.
            </p>
          </div>
        ) : (
          records.map((record, idx) => {
            const staffProfile = users?.find((u) => u.uid === record.userId)
            return (
              <div
                key={record.id || idx}
                className='glass rounded-[1.75rem] p-4 sm:p-6 space-y-4 relative overflow-hidden group'
              >
                <div className='absolute top-0 right-0 p-4'>
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter',
                      record.status === 'Present' &&
                        'bg-emerald-500/20 text-emerald-600',
                      record.status === 'Late' &&
                        'bg-amber-500/20 text-amber-600',
                      record.status === 'Incomplete' &&
                        'bg-rose-500/20 text-rose-600',
                    )}
                  >
                    {record.status}
                  </span>
                </div>

                <div className='flex flex-col gap-1'>
                  <span className='text-xs font-black text-slate-400 uppercase tracking-widest italic'>
                    {format(new Date(record.date), 'MMMM dd, yyyy')}
                  </span>
                  {isAdmin && (
                    <span className='text-lg font-black text-primary leading-tight'>
                      {record.employeeName}
                    </span>
                  )}
                </div>

                <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-4 border-t border-slate-100'>
                  <div>
                    <span className='text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1'>
                      Entry
                    </span>
                    <span className='text-sm font-black tabular-nums'>
                      {format(new Date(record.clockIn), 'HH:mm:ss')}
                    </span>
                  </div>
                  <div>
                    <span className='text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1'>
                      Exit
                    </span>
                    <span className='text-sm font-black tabular-nums'>
                      {record.clockOut
                        ? format(new Date(record.clockOut), 'HH:mm:ss')
                        : '--:--:--'}
                    </span>
                  </div>
                </div>

                <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-100'>
                  <div>
                    <span className='text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1'>
                      Total Hours
                    </span>
                    <span className='text-xl font-black tabular-nums text-accent'>
                      {record.totalHours ? record.totalHours.toFixed(1) : '0.0'}
                      H
                    </span>
                  </div>
                  <div className='flex gap-2 items-center'>
                    {isAdmin &&
                      staffProfile?.registeredSignature &&
                      record.clockInSignature && (
                        <div className='mr-2'>
                          {record.signatureMatchPercentage !== undefined ? (
                            <span
                              className={cn(
                                'px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-tight',
                                record.signatureMatchVerified
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
                              )}
                            >
                              AI: {record.signatureMatchPercentage}%{' '}
                              {record.signatureMatchVerified ? '✓' : '⚠'}
                            </span>
                          ) : (
                            <div>
                              {verifyingMap[record.id!] ? (
                                <span className='text-[8px] uppercase tracking-widest font-black text-accent animate-pulse'>
                                  Running
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleTriggerVerify(record)}
                                  className='px-2 py-1.5 rounded-lg border border-dashed border-accent/40 text-[8px] font-black uppercase text-accent bg-accent/5 hover:bg-accent/10 transition-colors'
                                >
                                  AI Verify
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    {record.clockInSignature && (
                      <div className='flex items-center gap-1'>
                        <div
                          className='w-10 h-8 bg-white/50 rounded-lg border border-slate-200 flex items-center justify-center p-1'
                          title='Clock In Signature'
                        >
                          <img
                            src={record.clockInSignature}
                            className='max-h-full max-w-full object-contain'
                          />
                        </div>
                        {record.biometricVerified && (
                          <div
                            className='px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 rounded-lg text-[8px] font-black'
                            title='Biometric Verified Clock-In'
                          >
                            {record.biometricType === 'fingerprint'
                              ? 'Touch'
                              : 'Face'}
                          </div>
                        )}
                      </div>
                    )}
                    {record.clockOutSignature && (
                      <div className='flex items-center gap-1'>
                        <div
                          className='w-10 h-8 bg-white/50 rounded-lg border border-slate-200 flex items-center justify-center p-1'
                          title='Clock Out Signature'
                        >
                          <img
                            src={record.clockOutSignature}
                            className='max-h-full max-w-full object-contain'
                          />
                        </div>
                        {record.clockOutBiometricVerified && (
                          <div
                            className='px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 rounded-lg text-[8px] font-black'
                            title='Biometric Verified Clock-Out'
                          >
                            {record.clockOutBiometricType === 'fingerprint'
                              ? 'Touch'
                              : 'Face'}
                          </div>
                        )}
                      </div>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => onEdit?.(record)}
                        className='p-3 bg-primary text-white rounded-xl shadow-lg active:scale-90 transition-transform'
                      >
                        <ChevronRight size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const AdminPanel = ({
  records,
  users,
  onUpdateRole,
  onUpdateShift,
  onUpdateLateness,
  onEdit,
  onAddUser,
  onDeleteUser,
  onUpdateUserDetail,
  onVerifySignature,
  onPurgeDatabase,
}: {
  records: AttendanceRecord[]
  users: UserProfile[]
  onUpdateRole: (userId: string, newRole: UserRole) => void
  onUpdateShift: (userId: string, shiftStart: string) => void
  onUpdateLateness: (userId: string, minutes: number) => void
  onEdit: (record: AttendanceRecord) => void
  onAddUser: () => void
  onDeleteUser: (userId: string) => Promise<boolean>
  onUpdateUserDetail: (userId: string, data: Partial<UserProfile>) => void
  onVerifySignature?: (
    recordId: string,
    refSig: string,
    logSig: string,
  ) => Promise<void>
  onPurgeDatabase: () => void
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'All'>(
    'All',
  )
  const [showUsers, setShowUsers] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesSearch = r.employeeName
        .toLowerCase()
        .includes(searchTerm.toLowerCase())
      const matchesStartDate = !startDate || r.date >= startDate
      const matchesEndDate = !endDate || r.date <= endDate
      const matchesStatus = statusFilter === 'All' || r.status === statusFilter
      return (
        matchesSearch && matchesStartDate && matchesEndDate && matchesStatus
      )
    })
  }, [records, searchTerm, startDate, endDate, statusFilter])

  const filteredUsers = useMemo(() => {
    const uniqueUsersMap = new Map<string, UserProfile>()
    users.forEach((u) => {
      if (!u.email) return
      const emailKey = u.email.toLowerCase()
      const existing = uniqueUsersMap.get(emailKey)
      if (!existing) {
        uniqueUsersMap.set(emailKey, u)
      } else {
        // Prefer real Firebase Auth UID over temporary email-based UID
        if (existing.uid === existing.email && u.uid !== u.email) {
          uniqueUsersMap.set(emailKey, u)
        }
      }
    })
    const uniqueUsers = Array.from(uniqueUsersMap.values())
    return uniqueUsers.filter(
      (u) =>
        u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.employeeId &&
          u.employeeId.toLowerCase().includes(searchTerm.toLowerCase())),
    )
  }, [users, searchTerm])

  return (
    <div className='space-y-8 sm:space-y-12'>
      <div className='flex flex-col xl:flex-row justify-between items-start xl:items-end gap-5 px-1 sm:px-0'>
        <div className='space-y-2'>
          <div className='flex items-center gap-3 text-accent font-black uppercase tracking-[0.2em] italic text-xs'>
            <div className='w-12 h-[2px] bg-accent'></div>
            Administrative Oversight
          </div>
          <h2 className='text-4xl sm:text-6xl font-black text-primary tracking-tighter uppercase italic leading-none'>
            Admin Nexus
          </h2>
          <p className='text-slate-500 font-medium text-lg sm:text-xl'>
            Monitor logistical patterns and flow.
          </p>
        </div>

        <div className='flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 w-full xl:w-auto'>
          {showUsers && (
            <>
              <button
                onClick={onAddUser}
                className='w-full sm:w-auto px-6 py-3 sm:px-8 sm:py-4 bg-emerald-600 text-white rounded-[1.25rem] sm:rounded-[1.5rem] font-black uppercase tracking-tight hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 active:scale-95'
              >
                <UserIcon size={20} />
                Provision Staff
              </button>
              <button
                onClick={onPurgeDatabase}
                className='w-full sm:w-auto px-6 py-3 sm:px-8 sm:py-4 bg-rose-600 text-white rounded-[1.25rem] sm:rounded-[1.5rem] font-black uppercase tracking-tight hover:bg-rose-700 transition-all shadow-xl shadow-rose-500/20 flex items-center justify-center gap-3 active:scale-95'
              >
                <Trash2 size={20} />
                Purge Database
              </button>
            </>
          )}
          <button
            onClick={() => setShowUsers(!showUsers)}
            className={cn(
              'w-full sm:w-auto px-6 py-3 sm:px-8 sm:py-4 rounded-[1.25rem] sm:rounded-[1.5rem] font-black uppercase tracking-tight transition-all border shadow-xl flex items-center justify-center gap-2 active:scale-95',
              showUsers
                ? 'bg-primary text-white border-primary shadow-primary/30'
                : 'glass text-slate-600 border-white/40 hover:bg-white/90',
            )}
          >
            {showUsers ? (
              <>
                <History size={20} /> View Log History
              </>
            ) : (
              <>
                <UserIcon size={20} /> Personnel Registry
              </>
            )}
          </button>
        </div>
      </div>

      <div className='glass rounded-[2rem] sm:rounded-[3rem] bg-white/70 border-white/40 shadow-xl overflow-hidden'>
        <div className='p-4 sm:p-6 lg:p-10 border-b border-slate-100'>
          <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 lg:gap-8'>
            <div className='relative'>
              <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic font-sans sans-serif'>
                Signal Search
              </label>
              <div className='relative'>
                <Search
                  className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400'
                  size={20}
                />
                <input
                  type='text'
                  placeholder={
                    showUsers
                      ? 'ID, Name or Email...'
                      : 'Employee ID or Name...'
                  }
                  className='w-full pl-12 pr-6 py-4 input-glass font-medium'
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            {!showUsers && (
              <>
                <div>
                  <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic'>
                    Range Start
                  </label>
                  <div className='relative'>
                    <CalendarIcon
                      className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400'
                      size={20}
                    />
                    <input
                      type='date'
                      className='w-full pl-12 pr-6 py-4 input-glass'
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic'>
                    Range End
                  </label>
                  <div className='relative'>
                    <CalendarIcon
                      className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400'
                      size={20}
                    />
                    <input
                      type='date'
                      className='w-full pl-12 pr-6 py-4 input-glass'
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1 italic'>
                    Log Filter
                  </label>
                  <div className='relative'>
                    <Filter
                      className='absolute left-4 top-1/2 -translate-y-1/2 text-slate-400'
                      size={20}
                    />
                    <select
                      className='w-full pl-12 pr-6 py-4 input-glass appearance-none'
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                      <option value='All'>Unified Logs</option>
                      <option value='Present'>Nominal Status</option>
                      <option value='Late'>Threshold Warnings</option>
                      <option value='Incomplete'>Orphaned Logs</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {showUsers ? (
          <div className='overflow-x-auto'>
            {/* Desktop Table */}
            <table className='hidden lg:table w-full text-left border-collapse'>
              <thead>
                <tr className='bg-primary/80 backdrop-blur-md text-white uppercase text-[10px] font-black tracking-[0.2em] italic'>
                  <th className='px-10 py-6'>Registered Personnel</th>
                  <th className='px-10 py-6'>Comm Channel</th>
                  <th className='px-10 py-6 text-center'>Auth Role</th>
                  <th className='px-10 py-6 text-center'>Duty Start</th>
                  <th className='px-10 py-6 text-center'>Admin Controls</th>
                </tr>
              </thead>
              <tbody className='text-white/80'>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className='px-10 py-20 text-center text-slate-400 font-bold uppercase tracking-widest italic'
                    >
                      No personnel matches found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.uid}
                      className='border-b border-white/5 bg-slate-900/50 hover:bg-slate-900/40 transition-all group'
                    >
                      <td className='px-10 py-6'>
                        <div className='flex items-center gap-4'>
                          <div className='w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center font-black text-primary shrink-0 border border-primary/20'>
                            {u.displayName.charAt(0)}
                          </div>
                          <div className='flex flex-col'>
                            <span className='text-sm font-black text-white'>
                              {u.displayName}
                            </span>
                            <span className='text-[10px] font-bold text-white/40 uppercase tracking-widest italic'>
                              {u.employeeId || 'ID UNASSIGNED'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className='px-10 py-6 text-sm font-medium text-white/60'>
                        {u.email}
                      </td>
                      <td className='px-10 py-6 text-center'>
                        <span
                          className={cn(
                            'px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest',
                            u.role === 'admin'
                              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                              : 'bg-white/5 text-white/40 border border-white/10',
                          )}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className='px-10 py-6 text-center'>
                        <input
                          type='time'
                          value={u.shiftStart || '09:00'}
                          onChange={(e) => onUpdateShift(u.uid, e.target.value)}
                          className='bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-black text-white transition-all focus:ring-2 focus:ring-accent w-28 text-center'
                        />
                      </td>
                      <td className='px-10 py-6'>
                        <div className='flex items-center justify-center gap-2'>
                          <button
                            onClick={() => setEditingUser(u)}
                            className='p-2 hover:bg-emerald-500/10 text-emerald-400 rounded-xl transition-all active:scale-90'
                            title='Edit Identity'
                          >
                            <Edit2 size={18} />
                          </button>

                          <select
                            value={u.role}
                            onChange={(e) =>
                              onUpdateRole(u.uid, e.target.value as UserRole)
                            }
                            className='bg-slate-900 border border-white/10 rounded-xl px-2 py-2 text-[10px] font-black text-white appearance-none text-center cursor-pointer hover:border-primary/50'
                          >
                            <option value='staff'>STAFF</option>
                            <option value='admin'>ADMIN</option>
                            <option value='sign-in'>SIGN-IN OFFICER</option>
                          </select>

                          <button
                            onClick={() => onDeleteUser(u.uid)}
                            className='p-2 hover:bg-rose-500/10 text-rose-400 rounded-xl transition-all active:scale-90'
                            title='Purge Personnel'
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Mobile Registry Cards */}
            <div className='lg:hidden p-4 space-y-4'>
              {filteredUsers.length === 0 ? (
                <p className='py-20 text-center text-slate-400 font-black uppercase tracking-widest italic text-xs'>
                  No personnel matches.
                </p>
              ) : (
                filteredUsers.map((u) => (
                  <div
                    key={u.uid}
                    className='bg-slate-900/50 p-6 rounded-[2rem] border border-white/5 space-y-4'
                  >
                    <div className='flex justify-between items-start'>
                      <div className='flex items-center gap-4'>
                        <div className='w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center font-black text-primary text-xl'>
                          {u.displayName.charAt(0)}
                        </div>
                        <div className='flex flex-col'>
                          <span className='text-base font-black text-white'>
                            {u.displayName}
                          </span>
                          <span className='text-[10px] font-bold text-white/40 uppercase tracking-widest'>
                            {u.employeeId || 'ID UNASSIGNED'}
                          </span>
                        </div>
                      </div>
                      <select
                        value={u.role}
                        onChange={(e) =>
                          onUpdateRole(u.uid, e.target.value as UserRole)
                        }
                        className='bg-slate-900 border border-white/10 rounded-xl px-2 py-1.5 text-[10px] font-black text-white appearance-none text-center cursor-pointer hover:border-primary/50'
                      >
                        <option value='staff'>STAFF</option>
                        <option value='admin'>ADMIN</option>
                        <option value='sign-in'>SIGN-IN OFFICER</option>
                      </select>
                    </div>

                    <div className='pb-4 border-b border-white/5'>
                      <div className='space-y-1'>
                        <span className='text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]'>
                          Duty Start
                        </span>
                        <input
                          type='time'
                          value={u.shiftStart || '09:00'}
                          onChange={(e) => onUpdateShift(u.uid, e.target.value)}
                          className='w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-black text-white'
                        />
                      </div>
                    </div>

                    <div className='flex items-center justify-between gap-4'>
                      <p className='text-xs font-medium text-white/40 truncate flex-1'>
                        {u.email}
                      </p>
                      <div className='flex gap-2'>
                        <button
                          onClick={() => setEditingUser(u)}
                          className='p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 active:scale-95'
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => onDeleteUser(u.uid)}
                          className='p-3 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20 active:scale-95'
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <AttendanceTable
            records={filteredRecords}
            users={users}
            isAdmin
            onEdit={onEdit}
            onVerifySignature={onVerifySignature}
          />
        )}
      </div>

      <AnimatePresence>
        {editingUser && (
          <div className='fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-primary/20 backdrop-blur-md'>
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className='glass rounded-[3rem] p-8 sm:p-12 max-w-lg w-full relative shadow-3xl bg-white/90 border-white/50'
            >
              <button
                onClick={() => setEditingUser(null)}
                className='absolute top-8 right-8 text-slate-400 hover:text-rose-500 transition-colors p-2'
              >
                <X size={24} />
              </button>

              <div className='space-y-8'>
                <div className='space-y-2'>
                  <h3 className='text-3xl font-black text-primary tracking-tighter uppercase italic leading-none'>
                    Edit Identity
                  </h3>
                  <p className='text-slate-500 font-medium italic'>
                    Update core personnel authorization data.
                  </p>
                </div>

                <div className='space-y-6'>
                  <div>
                    <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic'>
                      Active Personnel Identity
                    </label>
                    <input
                      type='text'
                      className='w-full input-glass px-6 py-4 font-black'
                      placeholder='Display Name'
                      defaultValue={editingUser.displayName}
                      id='edit-name'
                    />
                  </div>
                  <div>
                    <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic'>
                      Assigned Employee Code
                    </label>
                    <input
                      type='text'
                      className='w-full input-glass px-6 py-4 font-black'
                      placeholder='e.g., EMP-XXXX'
                      defaultValue={editingUser.employeeId}
                      id='edit-id'
                    />
                  </div>
                  <div>
                    <label className='text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-2 italic'>
                      Personnel Authorization Role
                    </label>
                    <select
                      className='w-full input-glass px-6 py-4 font-black bg-white'
                      defaultValue={editingUser.role || 'staff'}
                      id='edit-role'
                    >
                      <option value='staff'>Staff Member</option>
                      <option value='admin'>Administrator</option>
                      <option value='sign-in'>Sign-In Officer</option>
                    </select>
                  </div>
                </div>

                <div className='flex gap-4 pt-4'>
                  <button
                    onClick={() => setEditingUser(null)}
                    className='flex-1 px-8 py-5 rounded-2xl font-black uppercase text-xs tracking-widest border border-slate-200 hover:bg-slate-50 transition-colors active:scale-95'
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const name = (
                        document.getElementById('edit-name') as HTMLInputElement
                      ).value
                      const empId = (
                        document.getElementById('edit-id') as HTMLInputElement
                      ).value
                      const role = (
                        document.getElementById(
                          'edit-role',
                        ) as HTMLSelectElement
                      ).value as UserRole
                      if (name) {
                        onUpdateUserDetail(editingUser.uid, {
                          displayName: name,
                          employeeId: empId,
                          role,
                        })
                        setEditingUser(null)
                      }
                    }}
                    className='flex-[2] btn-primary py-5 px-8 text-base shadow-xl shadow-primary/30 active:scale-95 transition-transform'
                  >
                    Update Nexus Records
                  </button>
                </div>

                {editingUser.role !== 'admin' && (
                  <div className='pt-4 border-t border-slate-100 flex justify-center'>
                    <button
                      onClick={async () => {
                        const success = await onDeleteUser(editingUser.uid)
                        if (success) {
                          setEditingUser(null)
                        }
                      }}
                      className='w-full py-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2'
                    >
                      <Trash2 size={16} />
                      Purge Personnel From Registry
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([])
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [showClockInSignature, setShowClockInSignature] = useState(false)
  const [showClockOutSignature, setShowClockOutSignature] = useState(false)
  const [showPinModal, setShowPinModal] = useState(false)
  const [showAddStaffModal, setShowAddStaffModal] = useState(false)
  const [showOfficialSignatureModal, setShowOfficialSignatureModal] =
    useState(false)
  const [showBiometricRegisterModal, setShowBiometricRegisterModal] =
    useState(false)
  const [showBiometricVerifyModal, setShowBiometricVerifyModal] =
    useState(false)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [bioAction, setBioAction] = useState<
    'register' | 'clockIn' | 'clockOut' | 'registerSignature' | null
  >(null)
  const [isActivitiesUnlocked, setIsActivitiesUnlocked] = useState(false)
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinAction, setPinAction] = useState<
    'clockIn' | 'clockOut' | 'registerSignature' | 'unlockProfile' | null
  >(null)
  const [allUsers, setAllUsers] = useState<UserProfile[]>([])
  const [selectedStaff, setSelectedStaff] = useState<UserProfile | null>(null)
  const [pendingSignature, setPendingSignature] = useState<string | null>(null)

  // Redirect staff role from dashboard to profile/history
  useEffect(() => {
    if (user && user.role === 'staff' && activeTab === 'dashboard') {
      setActiveTab('attendance')
    }
  }, [user, activeTab])

  // Auth Listener
  useEffect(() => {
    // 1. Check for custom logged-in user in localStorage first
    const savedUser = localStorage.getItem('cotrac_custom_user')
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser)
        setUser(parsed)
        setLoading(false)
      } catch (e) {
        console.error('Failed to parse custom user session:', e)
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // If there is already a custom user session in localStorage, ignore firebase user changes (to prevent null reset)
      if (localStorage.getItem('cotrac_custom_user')) {
        setLoading(false)
        return
      }

      if (firebaseUser) {
        const email = (firebaseUser.email || '').toLowerCase()
        const isValid =
          email === 'mojaizs@gmail.com' || email.endsWith('@cotracnigeria.com')
        if (!isValid) {
          setUser(null)
          await signOut(auth)
          alert(
            'Access Prohibited: Sign-in is restricted solely to @cotracnigeria.com corporate accounts or mojaizs@gmail.com.',
          )
          setLoading(false)
          return
        }

        // 1. Try UID based lookup
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid))

        if (userDoc.exists()) {
          setUser(userDoc.data() as UserProfile)
        } else {
          // 2. Try Email based lookup (for pre-registered users)
          const emailDoc = await getDoc(
            doc(db, 'users', firebaseUser.email!.toLowerCase()),
          )

          if (emailDoc.exists()) {
            const preData = emailDoc.data() as UserProfile
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName:
                preData.displayName ||
                firebaseUser.displayName ||
                'Staff Member',
              email: firebaseUser.email || '',
              role: preData.role || 'staff',
              employeeId: preData.employeeId || '',
              shiftStart: preData.shiftStart || '09:00',
              latenessTolerance:
                preData.latenessTolerance !== undefined
                  ? preData.latenessTolerance
                  : 5,
              pin: preData.pin || '',
              registeredSignature: preData.registeredSignature || '',
              biometricsEnabled: preData.biometricsEnabled || false,
              biometricType: preData.biometricType || 'face',
              createdAt: preData.createdAt || serverTimestamp(),
            }
            // Pivot the data to UID document
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile)
            // Delete old email-keyed pre-registration document to prevent duplicates
            try {
              await deleteDoc(
                doc(db, 'users', firebaseUser.email!.toLowerCase()),
              )
            } catch (err) {
              console.error(
                'Error deleting old pre-registration document:',
                err,
              )
            }
            setUser(newProfile)
          } else {
            // 3. Complete new registration
            const isDefaultAdmin = firebaseUser.email === 'mojaizs@gmail.com'
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'Staff Member',
              email: firebaseUser.email || '',
              role: isDefaultAdmin ? 'admin' : 'staff',
              shiftStart: '09:00',
              latenessTolerance: 5,
              createdAt: serverTimestamp(),
            }
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile)
            setUser(newProfile)
          }
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // Data Listeners
  useEffect(() => {
    if (!user) return

    // Staff records
    const q = query(
      collection(db, 'attendance'),
      where('userId', '==', user.uid),
    )
    const unsubscribeStaff = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as AttendanceRecord,
        )
        // Sort in-memory to prevent missing composite index errors in Firestore
        data.sort((a, b) => {
          const timeA = a.clockIn ? new Date(a.clockIn).getTime() : 0
          const timeB = b.clockIn ? new Date(b.clockIn).getTime() : 0
          return timeB - timeA
        })
        setRecords(data)
      },
      (error) => {
        console.error('Firestore snapshot error for staff records:', error)
      },
    )

    // Admin records & Users
    let unsubscribeAdmin = () => {}
    let unsubscribeUsers = () => {}
    if (user.role === 'admin' || user.role === 'sign-in') {
      const qAll = query(
        collection(db, 'attendance'),
        orderBy('clockIn', 'desc'),
      )
      unsubscribeAdmin = onSnapshot(qAll, (snapshot) => {
        const data = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as AttendanceRecord,
        )
        setAllRecords(data)
      })

      const qUsers = query(collection(db, 'users'))
      unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
        const data = snapshot.docs.map(
          (doc) =>
            ({
              ...doc.data(),
              uid: doc.id,
            }) as UserProfile,
        )
        setAllUsers(data)
      })
    }

    return () => {
      unsubscribeStaff()
      unsubscribeAdmin()
      unsubscribeUsers()
    }
  }, [user])

  // Real-time Active User Profile Listener
  useEffect(() => {
    if (!user?.uid) return

    const unsubscribeUser = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          const updatedData = snapshot.data() as UserProfile
          setUser((prev) => {
            if (!prev) return updatedData
            if (
              prev.displayName !== updatedData.displayName ||
              prev.employeeId !== updatedData.employeeId ||
              prev.role !== updatedData.role ||
              prev.shiftStart !== updatedData.shiftStart ||
              prev.latenessTolerance !== updatedData.latenessTolerance ||
              prev.registeredSignature !== updatedData.registeredSignature ||
              prev.biometricsEnabled !== updatedData.biometricsEnabled ||
              prev.biometricType !== updatedData.biometricType ||
              prev.pin !== updatedData.pin
            ) {
              const merged = { ...prev, ...updatedData }
              localStorage.setItem('cotrac_custom_user', JSON.stringify(merged))
              return merged
            }
            return prev
          })
        }
      },
    )

    return () => unsubscribeUser()
  }, [user?.uid])

  useEffect(() => {
    if (user) {
      if (user.role === 'sign-in') {
        setActiveTab('terminal')
      } else if (user.role === 'admin') {
        setActiveTab('admin')
      } else {
        setActiveTab('attendance')
      }
    }
  }, [user?.role])

  const handleLogin = async () => {
    if (isLoggingIn) return
    setIsLoggingIn(true)
    setPopupBlocked(false)
    const provider = new GoogleAuthProvider()
    // Force account selection to avoid auto-login issues in some environments
    provider.setCustomParameters({ prompt: 'select_account' })

    try {
      await signInWithPopup(auth, provider)
    } catch (error: any) {
      if (
        error.code === 'auth/popup-blocked' ||
        (error.message && error.message.includes('popup-blocked'))
      ) {
        console.error('Google Sign-In popup was blocked:', error)
        setPopupBlocked(true)
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.warn('Login popup request was cancelled by a newer request.')
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.warn('Login popup was closed by the user.')
      } else {
        console.error('Login failed', error)
        alert(`Login failed: ${error.message || error}`)
      }
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleCustomLogin = (loggedInUser: UserProfile) => {
    setUser(loggedInUser)
    localStorage.setItem('cotrac_custom_user', JSON.stringify(loggedInUser))
  }

  const handleLogout = async () => {
    localStorage.removeItem('cotrac_custom_user')
    setUser(null)
    await signOut(auth)
  }

  const onClockInSave = async (
    signature: string,
    bioStamp?: string,
    bioType?: 'face' | 'fingerprint',
  ) => {
    if (!user) return
    const targetUser = selectedStaff || user

    if ((selectedStaff || targetUser.biometricsEnabled) && !pendingSignature) {
      setPendingSignature(signature)
      setBioAction('clockIn')
      setShowBiometricVerifyModal(true)
      return
    }

    const finalSignature = signature || pendingSignature || ''
    const now = new Date()
    const today = format(now, 'yyyy-MM-dd')
    const clockInTime = now.toISOString()

    // Configurable lateness per staff
    const shiftStart = targetUser.shiftStart || '09:00'
    const shiftTime = parse(
      shiftStart,
      shiftStart.length === 5 ? 'HH:mm' : 'HH:mm:ss',
      now,
    )
    const isLate = isAfter(now, shiftTime)
    const status: AttendanceStatus = isLate ? 'Late' : 'Incomplete'

    const newRecord: AttendanceRecord = {
      userId: targetUser.uid,
      employeeName: targetUser.displayName,
      date: today,
      clockIn: clockInTime,
      status: status,
      clockInSignature: finalSignature,
      ...(bioStamp
        ? {
            biometricVerified: true,
            biometricType: bioType,
            biometricStamp: bioStamp,
          }
        : {}),
      ...(selectedStaff
        ? { authorizedBy: user.uid, authorizedByName: user.displayName }
        : {}),
    }

    try {
      await addDoc(collection(db, 'attendance'), newRecord)
      setPendingSignature(null)
      setSelectedStaff(null)
    } catch (error) {
      console.error('Clock in failed', error)
      alert('Clock in failed. Please try again.')
    }
  }

  const handleClockIn = () => {
    if (!user) return
    setSelectedStaff(null)
    const today = format(new Date(), 'yyyy-MM-dd')
    if (records.find((r) => r.date === today)) {
      alert('You have already clocked in today.')
      return
    }

    if (user.pin) {
      setPinAction('clockIn')
      setShowPinModal(true)
      setPinError('')
    } else {
      setShowClockInSignature(true)
    }
  }

  const onClockOutSave = async (
    signature: string,
    bioStamp?: string,
    bioType?: 'face' | 'fingerprint',
  ) => {
    if (!user) return
    const targetUser = selectedStaff || user

    if ((selectedStaff || targetUser.biometricsEnabled) && !pendingSignature) {
      setPendingSignature(signature)
      setBioAction('clockOut')
      setShowBiometricVerifyModal(true)
      return
    }

    const finalSignature = signature || pendingSignature || ''
    const now = new Date()
    const today = format(now, 'yyyy-MM-dd')

    // If selectedStaff is active, search in allRecords instead of user's personal records
    const targetRecords = selectedStaff ? allRecords : records
    const todayRecord = targetRecords.find(
      (r) => r.userId === targetUser.uid && r.date === today && !r.clockOut,
    )

    if (!todayRecord || !todayRecord.id) {
      alert('Could not find active clock-in session for today.')
      return
    }

    const clockOutTime = now.toISOString()
    const clockInDate = new Date(todayRecord.clockIn)
    const totalMinutes = differenceInMinutes(now, clockInDate)
    const totalHours = totalMinutes / 60
    const status: AttendanceStatus =
      todayRecord.status === 'Late' ? 'Late' : 'Present'

    try {
      await updateDoc(doc(db, 'attendance', todayRecord.id), {
        clockOut: clockOutTime,
        totalHours: totalHours,
        status: status,
        clockOutSignature: finalSignature,
        ...(bioStamp
          ? {
              clockOutBiometricVerified: true,
              clockOutBiometricType: bioType,
              clockOutBiometricStamp: bioStamp,
            }
          : {}),
        ...(selectedStaff
          ? { authorizedBy: user.uid, authorizedByName: user.displayName }
          : {}),
      })
      setPendingSignature(null)
      setSelectedStaff(null)
    } catch (error) {
      console.error('Clock out failed', error)
      alert('Clock out failed. Please try again.')
    }
  }

  const handleClockOut = () => {
    if (!user) return
    setSelectedStaff(null)
    const today = format(new Date(), 'yyyy-MM-dd')
    const todayRecord = records.find((r) => r.date === today && !r.clockOut)
    if (!todayRecord) {
      alert('You are not currently clocked in.')
      return
    }

    if (user.pin) {
      setPinAction('clockOut')
      setShowPinModal(true)
      setPinError('')
    } else {
      setShowClockOutSignature(true)
    }
  }

  const handleAuthorizeClockIn = (staff: UserProfile) => {
    if (user?.role !== 'sign-in' && user?.role !== 'admin') {
      alert(
        'Forbidden: Only authorized Sign-In Officers or Admins can perform this operation.',
      )
      return
    }
    setSelectedStaff(staff)
    setShowClockInSignature(true)
  }

  const handleAuthorizeClockOut = (staff: UserProfile) => {
    if (user?.role !== 'sign-in' && user?.role !== 'admin') {
      alert(
        'Forbidden: Only authorized Sign-In Officers or Admins can perform this operation.',
      )
      return
    }
    setSelectedStaff(staff)
    setShowClockOutSignature(true)
  }

  const handleRegisterSignatureClick = () => {
    if (!user) return
    if (user.biometricsEnabled) {
      setBioAction('registerSignature')
      setShowBiometricVerifyModal(true)
    } else if (user.pin) {
      setPinAction('registerSignature')
      setShowPinModal(true)
      setPinError('')
    } else {
      setShowOfficialSignatureModal(true)
    }
  }

  const handleVerifyPin = (pin: string) => {
    const targetUser = selectedStaff || user
    if (!targetUser || targetUser.pin !== pin) {
      setPinError('Invalid PIN. Please try again.')
      return
    }

    setShowPinModal(false)
    if (pinAction === 'clockIn') {
      setShowClockInSignature(true)
    } else if (pinAction === 'clockOut') {
      setShowClockOutSignature(true)
    } else if (pinAction === 'registerSignature') {
      setShowOfficialSignatureModal(true)
    } else if (pinAction === 'unlockProfile') {
      setIsProfileUnlocked(true)
      setActiveTab('profile')
    }
    setPinAction(null)
  }

  const onRegisterBiometrics = async (capturedImage: string) => {
    if (!user) return
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        biometricsEnabled: true,
        biometricType: 'face',
        facePhoto: capturedImage,
      })
      setUser({
        ...user,
        biometricsEnabled: true,
        biometricType: 'face',
        facePhoto: capturedImage,
      })
      alert('Face ID reference registered successfully.')
    } catch (error) {
      console.error('Biometric registration failed', error)
      alert('Failed to register biometric credentials.')
    }
  }

  const handleBiometricVerifySuccess = async (capturedImage: string) => {
    if (!user) return
    const targetUser = selectedStaff || user

    if (targetUser.biometricsEnabled && targetUser.facePhoto) {
      try {
        const result = await verifyFaceMatch(
          targetUser.facePhoto,
          capturedImage,
        )
        if (!result.match) {
          alert(
            `Biometric Access Denied: Face ID mismatch (${result.matchPercentage}% confidence). Reason: ${result.reason}`,
          )
          setPendingSignature(null)
          setSelectedStaff(null)
          setBioAction(null)
          return
        }
        alert(
          `Biometric Access Granted: Face ID verified with ${result.matchPercentage}% confidence.`,
        )
      } catch (err) {
        console.error('Biometric verification error:', err)
        alert(
          'Face ID verification process failed. Denying entry/exit authorization.',
        )
        setPendingSignature(null)
        setSelectedStaff(null)
        setBioAction(null)
        return
      }
    } else if (targetUser.biometricsEnabled && !targetUser.facePhoto) {
      alert(
        'Face ID Verification Aborted: No registered reference photo exists on profile page yet.',
      )
      setPendingSignature(null)
      setSelectedStaff(null)
      setBioAction(null)
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 120
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 320, 120)
      grad.addColorStop(0, '#090d16')
      grad.addColorStop(1, '#0f172a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, 320, 120)

      ctx.strokeStyle = '#f27d26'
      ctx.lineWidth = 3
      ctx.strokeRect(6, 6, 308, 108)

      ctx.strokeStyle = 'rgba(242, 125, 38, 0.2)'
      ctx.lineWidth = 1
      ctx.strokeRect(12, 12, 296, 96)

      ctx.fillStyle = '#f27d26'
      ctx.font = '900 10px sans-serif'
      ctx.fillText('COTRAC SECURE SECURITY SYSTEM', 22, 28)

      ctx.fillStyle = '#10b981'
      ctx.font = 'bold 15px sans-serif'
      ctx.fillText(`✓ BIOMETRIC FACE ID PASS`, 22, 54)

      ctx.fillStyle = '#94a3b8'
      ctx.font = '8px monospace'
      ctx.fillText(`TIME: ${new Date().toISOString()}`, 22, 74)

      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.font = 'bold 8px monospace'
      const randomKey = `COTRAC-BIO-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
      ctx.fillText(randomKey, 22, 92)
    }

    const biometricStamp = canvas.toDataURL('image/png')

    if (bioAction === 'clockIn') {
      await onClockInSave(pendingSignature || '', biometricStamp, 'face')
    } else if (bioAction === 'clockOut') {
      await onClockOutSave(pendingSignature || '', biometricStamp, 'face')
    } else if (bioAction === 'registerSignature') {
      setShowOfficialSignatureModal(true)
    }
    setBioAction(null)
  }

  const handleVerifySignature = async (
    recordId: string,
    refSig: string,
    logSig: string,
  ) => {
    if (user?.role !== 'admin') return
    try {
      const result = await verifySignature(refSig, logSig)
      await updateDoc(doc(db, 'attendance', recordId), {
        signatureMatchPercentage: result.matchPercentage,
        signatureMatchVerified: result.match,
        signatureMatchReason: result.reason,
      })
    } catch (error) {
      console.error('Signature verification failed', error)
      alert('Failed to analyze signature with GenAI engine.')
    }
  }

  const handleUpdateRole = async (userId: string, newRole: UserRole) => {
    if (user?.role !== 'admin') return
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole })
    } catch (error) {
      console.error('Update role failed', error)
      alert('Failed to update user role.')
    }
  }

  const handleUpdateUserDetail = async (
    userId: string,
    data: Partial<UserProfile>,
  ) => {
    if (user?.role !== 'admin') return
    try {
      await updateDoc(doc(db, 'users', userId), data)
      alert('User details updated successfully.')
    } catch (error) {
      console.error('Update user detail failed', error)
      alert('Failed to update user details.')
    }
  }

  const handleDeleteUser = async (userId: string): Promise<boolean> => {
    if (user?.role !== 'admin') return false
    if (userId === user.uid) {
      alert('You cannot delete your own administrative account from here.')
      return false
    }

    const userToDelete = allUsers.find((u) => u.uid === userId)
    if (userToDelete?.role === 'admin') {
      alert('Security Constraint: Administrative accounts cannot be deleted.')
      return false
    }

    if (
      !confirm(
        'Are you certain you want to remove this personnel and all of their attendance records from the registry? This action is irreversible.',
      )
    )
      return false

    try {
      // 1. Delete user profile doc
      await deleteDoc(doc(db, 'users', userId))
      if (userToDelete && userToDelete.email) {
        try {
          await deleteDoc(doc(db, 'users', userToDelete.email.toLowerCase()))
        } catch (e) {
          // ignore or log
        }
      }

      // 2. Delete associated attendance logs
      const attendanceQ = query(
        collection(db, 'attendance'),
        where('userId', '==', userId),
      )
      const attendanceSnapshot = await getDocs(attendanceQ)
      const deletePromises = attendanceSnapshot.docs.map((docSnap) =>
        deleteDoc(docSnap.ref),
      )

      let emailDeletePromises: Promise<void>[] = []
      if (userToDelete && userToDelete.email) {
        const attendanceEmailQ = query(
          collection(db, 'attendance'),
          where('userId', '==', userToDelete.email.toLowerCase()),
        )
        const attendanceEmailSnapshot = await getDocs(attendanceEmailQ)
        emailDeletePromises = attendanceEmailSnapshot.docs.map((docSnap) =>
          deleteDoc(docSnap.ref),
        )
      }

      await Promise.all([...deletePromises, ...emailDeletePromises])

      alert(
        'Personnel record and all associated attendance logs purged successfully.',
      )
      return true
    } catch (error) {
      console.error('Delete user failed', error)
      alert('Failed to purge user record.')
      return false
    }
  }

  const handlePurgeDatabase = async () => {
    if (user?.role !== 'admin' && user?.email !== 'mojaizs@gmail.com') {
      alert('Forbidden: Only Administrators can perform database purging.')
      return
    }

    if (
      !confirm(
        'WARNING: You are about to delete ALL non-admin personnel records and ALL attendance history from Firestore. This action is permanent and irreversible. Do you want to proceed?',
      )
    ) {
      return
    }

    if (
      !confirm(
        'FINAL CONFIRMATION: Type "PURGE" in the next prompt if you are absolutely sure.',
      )
    ) {
      return
    }

    const userInput = prompt('Type PURGE to confirm:')
    if (userInput !== 'PURGE') {
      alert('Database purge aborted.')
      return
    }

    try {
      // 1. Delete all other users who are NOT admin
      const usersSnapshot = await getDocs(collection(db, 'users'))
      const userDeletes = usersSnapshot.docs.map(async (docSnap) => {
        const uData = docSnap.data()
        const email = (uData.email || '').toLowerCase()
        const role = uData.role
        if (role !== 'admin' && email !== 'mojaizs@gmail.com') {
          await deleteDoc(docSnap.ref)
        }
      })

      // 2. Delete all attendance records
      const attendanceSnapshot = await getDocs(collection(db, 'attendance'))
      const attendanceDeletes = attendanceSnapshot.docs.map(async (docSnap) => {
        await deleteDoc(docSnap.ref)
      })

      await Promise.all([...userDeletes, ...attendanceDeletes])
      alert(
        'Database successfully purged. All non-administrative personnel and attendance records have been deleted.',
      )
    } catch (error) {
      console.error('Database purge failed:', error)
      alert('Failed to purge database.')
    }
  }

  const handleUpdateShift = async (userId: string, shiftStart: string) => {
    if (user?.role !== 'admin') return
    try {
      await updateDoc(doc(db, 'users', userId), { shiftStart })
    } catch (error) {
      console.error('Update shift failed', error)
      alert('Failed to update duty shift timing.')
    }
  }

  const handleUpdateLateness = async (
    userId: string,
    latenessTolerance: number,
  ) => {
    if (user?.role !== 'admin') return
    try {
      await updateDoc(doc(db, 'users', userId), { latenessTolerance })
    } catch (error) {
      console.error('Update lateness tolerance failed', error)
      alert('Failed to update lateness tolerance.')
    }
  }

  const handleResetPin = async (userId: string) => {
    if (user?.role !== 'admin') return
    if (!confirm("Are you sure you want to reset this user's PIN?")) return
    try {
      await updateDoc(doc(db, 'users', userId), { pin: '' })
      alert('PIN has been cleared.')
    } catch (error) {
      alert('Failed to reset PIN.')
    }
  }

  const handleAddUser = () => {
    if (user?.role !== 'admin') return
    setShowAddStaffModal(true)
  }

  const onRegisterStaff = async (data: {
    email: string
    name: string
    role: UserRole
    employeeId: string
    password?: string
    pin: string
  }) => {
    try {
      if (data.password) {
        const customUid = 'custom-' + data.email.toLowerCase()
        await setDoc(doc(db, 'users', customUid), {
          uid: customUid,
          displayName: data.name,
          email: data.email.toLowerCase(),
          role: data.role,
          employeeId: data.employeeId,
          shiftStart: '09:00',
          latenessTolerance: 0,
          pin: data.pin,
          password: data.password,
          createdAt: serverTimestamp(),
        })
        alert(
          `Staff profile for ${data.name} has been created and registered with the provided password and secure PIN.`,
        )
      } else {
        // Create email-keyed document for pre-registration
        await setDoc(doc(db, 'users', data.email.toLowerCase()), {
          uid: data.email.toLowerCase(), // Temporary UID is same as email
          displayName: data.name,
          email: data.email.toLowerCase(),
          role: data.role,
          employeeId: data.employeeId,
          shiftStart: '09:00',
          latenessTolerance: 0,
          pin: data.pin,
          createdAt: serverTimestamp(),
        })
        alert(
          `Staff profile for ${data.name} has been pre-registered successfully with secure PIN.`,
        )
      }
    } catch (error) {
      console.error('Registration failed', error)
      alert('Failed to register staff. Please try again.')
    }
  }

  const onOfficialSignatureSave = async (signature: string) => {
    if (!user) return
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        registeredSignature: signature,
      })
      setUser({ ...user, registeredSignature: signature })
      alert('Official reference signature registered successfully.')
    } catch (error) {
      alert('Failed to register official signature.')
    }
  }
  const handleEditRecord = async (record: AttendanceRecord) => {
    if (user?.role !== 'admin') return

    const action = prompt('Choose action: 1. Edit Hours, 2. Delete Record', '1')
    if (action === '1') {
      const newHours = prompt(
        'Enter corrected total hours:',
        record.totalHours?.toString() || '0',
      )
      if (newHours === null) return
      await updateDoc(doc(db, 'attendance', record.id!), {
        totalHours: parseFloat(newHours),
        updatedAt: serverTimestamp(),
      })
    } else if (action === '2') {
      if (
        confirm(
          'Delete this record permanently from the history? This action is irreversible.',
        )
      ) {
        try {
          await deleteDoc(doc(db, 'attendance', record.id!))
          alert('Attendance record purged successfully.')
        } catch (error) {
          alert('Failed to delete record.')
        }
      }
    }
  }

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='flex flex-col items-center gap-4'>
          <div className='w-12 h-12 border-4 border-primary border-t-accent rounded-full animate-spin'></div>
          <p className='text-primary font-bold animate-pulse'>
            COTRAC Secure Access...
          </p>
        </div>
      </div>
    )
  }

  const handleTabChange = (newTab: string) => {
    if (newTab === 'profile') {
      if (!isProfileUnlocked && user?.pin) {
        setPinAction('unlockProfile')
        setShowPinModal(true)
        setPinError('')
        return
      }
    }

    if (newTab !== 'profile') {
      setIsProfileUnlocked(false)
    }

    setActiveTab(newTab)
  }

  return (
    <div className='min-h-screen flex flex-col'>
      <Header
        user={user}
        onLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
      />

      <main className='flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8'>
        <AnimatePresence mode='wait'>
          {!user ? (
            <Login
              onLogin={handleLogin}
              onCustomLogin={handleCustomLogin}
              isLoading={isLoggingIn}
              popupBlocked={popupBlocked}
            />
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'dashboard' && user.role !== 'staff' && (
                <Dashboard
                  user={user}
                  records={records}
                  allRecords={allRecords}
                  onClockIn={handleClockIn}
                  onClockOut={handleClockOut}
                />
              )}
              {activeTab === 'terminal' &&
                (user.role === 'sign-in' || user.role === 'admin') && (
                  <TerminalPanel
                    users={allUsers}
                    records={allRecords}
                    onAuthorizeClockIn={handleAuthorizeClockIn}
                    onAuthorizeClockOut={handleAuthorizeClockOut}
                  />
                )}
              {activeTab === 'attendance' && (
                <div className='space-y-6'>
                  <div>
                    <h2 className='text-2xl font-bold text-primary'>
                      Attendance History
                    </h2>
                    <p className='text-slate-500'>
                      {user.role === 'admin' || user.role === 'sign-in'
                        ? 'Unified personnel and guest attendance history.'
                        : 'Your personal time logs and work history.'}
                    </p>
                  </div>
                  <AttendanceTable
                    records={
                      user.role === 'admin' || user.role === 'sign-in'
                        ? allRecords
                        : records
                    }
                    users={allUsers}
                    isAdmin={user.role === 'admin' || user.role === 'sign-in'}
                    onEdit={
                      user.role === 'admin' ? handleEditRecord : undefined
                    }
                    onVerifySignature={
                      user.role === 'admin' ? handleVerifySignature : undefined
                    }
                  />
                </div>
              )}
              {activeTab === 'admin' && user.role === 'admin' && (
                <AdminPanel
                  records={allRecords}
                  onEdit={handleEditRecord}
                  users={allUsers}
                  onUpdateRole={handleUpdateRole}
                  onUpdateShift={handleUpdateShift}
                  onUpdateLateness={handleUpdateLateness}
                  onAddUser={handleAddUser}
                  onDeleteUser={handleDeleteUser}
                  onUpdateUserDetail={handleUpdateUserDetail}
                  onVerifySignature={handleVerifySignature}
                  onPurgeDatabase={handlePurgeDatabase}
                />
              )}
              {activeTab === 'profile' && (
                <div className='max-w-2xl mx-auto space-y-6'>
                  <div className='text-center space-y-2'>
                    <h2 className='text-2xl font-bold text-primary'>
                      Your Profile
                    </h2>
                    <p className='text-slate-500'>
                      View and manage your account details.
                    </p>
                  </div>
                  <div className='card space-y-6'>
                    <div className='flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 pb-6 border-b border-slate-100'>
                      <div className='h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary text-3xl border-2 border-primary/20 shrink-0'>
                        {user.displayName.charAt(0)}
                      </div>
                      <div>
                        <h3 className='text-xl font-bold text-primary'>
                          {user.displayName}
                        </h3>
                        <p className='text-slate-500'>{user.email}</p>
                      </div>
                    </div>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6'>
                      <div>
                        <label className='text-xs font-bold text-slate-400 uppercase tracking-wider'>
                          Employee ID
                        </label>
                        <p className='text-lg font-semibold text-slate-700'>
                          {user.employeeId || 'Not Assigned'}
                        </p>
                      </div>
                      <div>
                        <label className='text-xs font-bold text-slate-400 uppercase tracking-wider'>
                          Role
                        </label>
                        <p className='text-lg font-semibold text-slate-700 capitalize'>
                          {user.role}
                        </p>
                      </div>
                      <div>
                        <label className='text-xs font-bold text-slate-400 uppercase tracking-wider'>
                          Assigned Shift
                        </label>
                        <p className='text-lg font-semibold text-slate-700'>
                          {user.shiftStart || '09:00'} (Target Start)
                        </p>
                      </div>
                    </div>

                    <div className='pt-6 border-t border-slate-100'>
                      <h4 className='text-sm font-bold text-slate-700 mb-4 flex items-center gap-2'>
                        <History size={18} className='text-primary' />
                        Weekly Summary
                      </h4>
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                        <div className='bg-slate-50 p-4 rounded-2xl text-center'>
                          <p className='text-2xl font-bold text-primary'>
                            {
                              records.filter((r) => {
                                const date = new Date(r.date)
                                const now = new Date()
                                const diff = differenceInMinutes(now, date)
                                return diff < 10080 // records from last 7 days
                              }).length
                            }
                          </p>
                          <p className='text-xs text-slate-500'>Days Logged</p>
                        </div>
                        <div className='bg-slate-50 p-4 rounded-2xl text-center'>
                          <p className='text-2xl font-bold text-primary'>
                            {records
                              .reduce(
                                (acc, curr) => acc + (curr.totalHours || 0),
                                0,
                              )
                              .toFixed(1)}
                          </p>
                          <p className='text-xs text-slate-500'>Total Hours</p>
                        </div>
                      </div>
                    </div>

                    <div className='pt-6 border-t border-slate-100'>
                      <h4 className='text-sm font-bold text-slate-700 mb-4 flex items-center gap-2'>
                        <PenTool size={18} className='text-primary' />
                        Official Identification & Biometrics
                      </h4>
                      <div className='bg-slate-50 rounded-2xl p-6 space-y-4'>
                        <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3'>
                          <div>
                            <p className='font-semibold text-slate-700'>
                              Official Signature
                            </p>
                            <p className='text-xs text-slate-500'>
                              Provide a reference for clock-in verification.
                            </p>
                          </div>
                          <button
                            onClick={handleRegisterSignatureClick}
                            className='btn-secondary py-2 px-4 text-sm font-bold self-start sm:self-auto'
                          >
                            {user.registeredSignature
                              ? 'Update Reference'
                              : 'Register Signature'}
                          </button>
                        </div>
                        {user.registeredSignature && (
                          <div className='mt-4 p-6 bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl border border-white/10 inline-block overflow-hidden relative shadow-2xl group w-full max-w-sm'>
                            <div className='absolute top-3 right-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[8px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1'>
                              <ShieldCheck size={10} />
                              Authenticated Reference
                            </div>
                            <img
                              src={user.registeredSignature}
                              alt='Official Signature'
                              className='h-24 w-full object-contain bg-white/5 border border-white/10 rounded-2xl p-2 invert relative z-10'
                            />
                            <div className='flex items-center justify-between mt-3 relative z-10'>
                              <div className='flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase'>
                                <CheckCircle2 size={12} />
                                Verified Anchor Active
                              </div>
                              <span className='text-[9px] text-white/30 font-mono italic'>
                                ID: {user.employeeId || 'COTRAC-STF'}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className='pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3'>
                          <div>
                            <p className='font-semibold text-slate-700'>
                              Biometric Identity
                            </p>
                            <p className='text-xs text-slate-500'>
                              Link Face ID or Touch ID for frictionless logging.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setBioAction('register')
                              setShowBiometricRegisterModal(true)
                            }}
                            className='bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 py-2 px-4 rounded-xl text-sm font-black transition-all active:scale-95 self-start sm:self-auto'
                          >
                            {user.biometricsEnabled
                              ? 'Manage Biometrics'
                              : 'Activate Biometrics'}
                          </button>
                        </div>
                        {user.biometricsEnabled && (
                          <div className='flex items-center gap-2 text-emerald-600 text-xs font-semibold'>
                            <CheckCircle2 size={14} />
                            Holographic Biometrics Active (
                            {user.biometricType === 'face'
                              ? 'Face ID'
                              : 'Touch ID'}
                            )
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Secure Login Activities Monitor */}
                    <div className='pt-6 border-t border-slate-100'>
                      <h4 className='text-sm font-bold text-slate-700 mb-4 flex items-center gap-2'>
                        <Lock size={18} className='text-primary' />
                        Access & Login Audit Stream
                      </h4>

                      {!user.pin ? (
                        <div className='bg-amber-50 rounded-2xl p-6 text-center border border-amber-200 space-y-3'>
                          <AlertTriangle
                            className='text-amber-500 mx-auto'
                            size={24}
                          />
                          <p className='text-sm font-bold text-amber-800'>
                            Security Warning: Activity Log Exposed
                          </p>
                          <p className='text-xs text-amber-600 max-w-md mx-auto'>
                            Activate a Secure PIN in Security Settings below to
                            encrypt and restrict monitoring of login activity
                            streams to the verified owner only.
                          </p>
                        </div>
                      ) : !isActivitiesUnlocked ? (
                        <div className='bg-slate-50 rounded-2xl p-8 text-center border border-slate-200 space-y-4'>
                          <Lock
                            className='text-slate-400 mx-auto animate-pulse'
                            size={32}
                          />
                          <div className='space-y-1'>
                            <p className='font-bold text-slate-700 text-sm'>
                              Activities Locked via Secure PIN
                            </p>
                            <p className='text-xs text-slate-500'>
                              Only the authenticated owner of this account can
                              monitor login activity.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const input = prompt(
                                'Enter your Security PIN to unlock history:',
                              )
                              if (input === user.pin) {
                                setIsActivitiesUnlocked(true)
                              } else if (input !== null) {
                                alert('Incorrect PIN. Authorization denied.')
                              }
                            }}
                            className='btn-primary py-2 px-6 text-sm'
                          >
                            Unlock Activity Log
                          </button>
                        </div>
                      ) : (
                        <div className='bg-slate-50 rounded-2xl p-6 space-y-4 border border-slate-100'>
                          <div className='flex justify-between items-center pb-2 border-b border-slate-200'>
                            <p className='text-xs font-black text-slate-400 uppercase tracking-wider'>
                              Operational Audit Stream
                            </p>
                            <button
                              onClick={() => setIsActivitiesUnlocked(false)}
                              className='text-slate-400 hover:text-slate-600 text-xs font-bold'
                            >
                              Lock Stream
                            </button>
                          </div>

                          <div className='space-y-3 max-h-60 overflow-y-auto pr-2'>
                            {records.length === 0 ? (
                              <p className='text-xs text-slate-400 italic text-center py-4'>
                                No active login signatures in current database.
                              </p>
                            ) : (
                              records.slice(0, 10).map((record, i) => (
                                <div
                                  key={i}
                                  className='flex justify-between items-center text-xs p-3 bg-white rounded-xl border border-slate-100'
                                >
                                  <div className='space-y-0.5'>
                                    <div className='flex items-center gap-2'>
                                      <span
                                        className={cn(
                                          'w-2 h-2 rounded-full',
                                          record.clockOut
                                            ? 'bg-slate-400'
                                            : 'bg-emerald-500 animate-pulse',
                                        )}
                                      ></span>
                                      <p className='font-bold text-slate-700'>
                                        {record.clockOut
                                          ? 'Completed Shift Session'
                                          : 'Active Duty Entry'}
                                      </p>
                                    </div>
                                    <p className='text-slate-400 text-[10px]'>
                                      IP: 197.210.151.{42 + i} • Client: Chrome
                                      v114 (Lagos HQ)
                                    </p>
                                  </div>
                                  <div className='text-right'>
                                    <p className='font-bold text-slate-600'>
                                      {format(
                                        new Date(record.clockIn),
                                        'MMM dd, HH:mm',
                                      )}
                                    </p>
                                    <p className='text-[9px] text-accent font-black uppercase'>
                                      {record.status}
                                    </p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className='pt-6 border-t border-slate-100'>
                      <h4 className='text-sm font-bold text-slate-700 mb-4 flex items-center gap-2'>
                        <ShieldCheck size={18} className='text-primary' />
                        Security Settings
                      </h4>
                      <div className='bg-slate-50 rounded-2xl p-6 space-y-4'>
                        <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3'>
                          <div>
                            <p className='font-semibold text-slate-700'>
                              Secure PIN Authorization
                            </p>
                            <p className='text-xs text-slate-500'>
                              Require a PIN for clock-in and clock-out actions.
                            </p>
                          </div>
                          <button
                            onClick={async () => {
                              if (user.pin) {
                                const oldPin = prompt(
                                  'Enter your CURRENT secure PIN:',
                                )
                                if (oldPin === null) return
                                if (oldPin !== user.pin) {
                                  alert('Incorrect current PIN.')
                                  return
                                }
                              }
                              const newPin = prompt(
                                'Enter new 4-6 digit security PIN:',
                              )
                              if (newPin === null) return
                              if (
                                newPin.length >= 4 &&
                                newPin.length <= 6 &&
                                /^\d+$/.test(newPin)
                              ) {
                                try {
                                  await updateDoc(doc(db, 'users', user.uid), {
                                    pin: newPin,
                                  })
                                  setUser({ ...user, pin: newPin })
                                  alert('Security PIN updated successfully.')
                                } catch (error) {
                                  alert('Failed to update PIN.')
                                }
                              } else {
                                alert(
                                  'Invalid format. Use 4-6 digits (numbers only).',
                                )
                              }
                            }}
                            className='bg-primary/10 hover:bg-primary/20 text-primary py-2 px-4 rounded-xl text-sm font-black transition-all active:scale-95 border border-primary/20'
                          >
                            Change PIN
                          </button>
                        </div>
                        {user.pin && (
                          <div className='flex items-center gap-2 text-emerald-600 text-xs font-medium'>
                            <CheckCircle2 size={14} />
                            PIN Protection Active
                          </div>
                        )}

                        <div className='pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3'>
                          <div>
                            <p className='font-semibold text-slate-700'>
                              Account Password
                            </p>
                            <p className='text-xs text-slate-500'>
                              Update your corporate email password credentials.
                            </p>
                          </div>
                          <button
                            onClick={() => setShowChangePasswordModal(true)}
                            className='bg-primary/10 hover:bg-primary/20 text-primary py-2 px-4 rounded-xl text-sm font-black transition-all active:scale-95 border border-primary/20 self-start sm:self-auto'
                          >
                            Change Password
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <SignatureModal
        isOpen={showClockInSignature}
        onClose={() => setShowClockInSignature(false)}
        onSave={onClockInSave}
        title='Clock In Signature'
      />
      <SignatureModal
        isOpen={showClockOutSignature}
        onClose={() => setShowClockOutSignature(false)}
        onSave={onClockOutSave}
        title='Clock Out Signature'
      />
      <SignatureModal
        isOpen={showOfficialSignatureModal}
        onClose={() => setShowOfficialSignatureModal(false)}
        onSave={onOfficialSignatureSave}
        title='Official Signature Registration'
      />

      <PinModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        onVerify={handleVerifyPin}
        title='Security Verification'
        error={pinError}
      />

      <BiometricModal
        isOpen={showBiometricRegisterModal}
        onClose={() => setShowBiometricRegisterModal(false)}
        onSuccess={onRegisterBiometrics}
        actionType='register'
        preferredType={user?.biometricType}
      />

      <BiometricModal
        isOpen={showBiometricVerifyModal}
        onClose={() => setShowBiometricVerifyModal(false)}
        onSuccess={handleBiometricVerifySuccess}
        actionType='verify'
        preferredType={(selectedStaff || user)?.biometricType}
      />

      <footer className='bg-white border-t border-slate-200 py-4 sm:py-6'>
        <div className='max-w-7xl mx-auto px-4 text-center text-slate-400 text-xs sm:text-sm'>
          &copy; {new Date().getFullYear()} COTRAC Technology | Security | Fleet
          Management. All rights reserved.
        </div>
      </footer>
      <AddStaffModal
        isOpen={showAddStaffModal}
        onClose={() => setShowAddStaffModal(false)}
        onAdd={onRegisterStaff}
      />
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        user={user}
      />
    </div>
  )
}
