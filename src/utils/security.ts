/**
 * Security & Sanitization Utilities
 * - Cryptographic SHA-256 password hashing with user-specific salt
 * - Input sanitization against XSS and injection
 * - Client-side rate limiter for authentication and sensitive actions
 */

/**
 * Computes a secure SHA-256 hash using the native Web Crypto API (standard in modern browsers).
 * Adds a constant domain salt plus user email salt to prevent rainbow table attacks.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const pepper = 'cotrac_auth_v2_pepper_#992$';
  const combined = `${pepper}:${salt.toLowerCase().trim()}:${password}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks if a stored password is already a SHA-256 hash (64 hex characters)
 */
export function isSha256Hash(str?: string): boolean {
  if (!str) return false;
  return /^[a-f0-9]{64}$/i.test(str.trim());
}

/**
 * Verifies a password against the stored password (handling legacy plaintext upgrade transparently)
 */
export async function verifyPassword(providedPassword: string, storedPasswordHash: string, salt: string): Promise<boolean> {
  if (!storedPasswordHash) return false;
  // If stored as SHA-256 hash
  if (isSha256Hash(storedPasswordHash)) {
    const computed = await hashPassword(providedPassword, salt);
    return computed === storedPasswordHash;
  }
  // Legacy migration check: if previously stored plaintext
  return providedPassword === storedPasswordHash;
}

/**
 * Input sanitization helper to neutralize HTML and script injections (XSS Protection)
 */
export function sanitizeInput(input: string, maxLength: number = 250): string {
  if (!input) return '';
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Strip angle brackets to prevent HTML/script tags
    .replace(/javascript:/gi, '') // Strip javascript pseudo-protocol
    .replace(/vbscript:/gi, '')
    .replace(/on\w+=/gi, ''); // Strip inline event handlers like onerror=, onclick=
}

/**
 * In-memory client-side Rate Limiter to guard against brute-force attacks
 */
class RateLimiter {
  private attempts: Map<string, { count: number; firstAttemptTime: number; blockedUntil?: number }> = new Map();

  /**
   * Checks if an action is allowed for an identifier (e.g. email or IP/action key).
   * @param key Identifier for the rate-limited entity (e.g. 'auth:john@cotracnigeria.com')
   * @param maxAttempts Maximum attempts allowed in the window
   * @param windowSeconds Window duration in seconds
   * @param blockSeconds Block duration if exceeded
   */
  public isAllowed(key: string, maxAttempts: number = 5, windowSeconds: number = 60, blockSeconds: number = 300): { allowed: boolean; waitSeconds?: number } {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry) {
      this.attempts.set(key, { count: 1, firstAttemptTime: now });
      return { allowed: true };
    }

    // Check if currently blocked
    if (entry.blockedUntil && entry.blockedUntil > now) {
      const waitSeconds = Math.ceil((entry.blockedUntil - now) / 1000);
      return { allowed: false, waitSeconds };
    }

    // Reset window if expired
    if (now - entry.firstAttemptTime > windowSeconds * 1000) {
      this.attempts.set(key, { count: 1, firstAttemptTime: now });
      return { allowed: true };
    }

    // Increment count
    entry.count += 1;
    if (entry.count > maxAttempts) {
      entry.blockedUntil = now + blockSeconds * 1000;
      const waitSeconds = Math.ceil(blockSeconds);
      return { allowed: false, waitSeconds };
    }

    return { allowed: true };
  }

  public reset(key: string): void {
    this.attempts.delete(key);
  }
}

export const authRateLimiter = new RateLimiter();
