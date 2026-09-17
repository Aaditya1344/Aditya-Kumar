/**
 * IN-MEMORY DATA STORE
 * NOTE: All data in this store is kept in-memory (JS Maps).
 * This means state is reset on cold starts, server restarts, or Vercel redeployments.
 * This is intentional for this IAM demo web application.
 */

class DataStore {
  constructor() {
    // Key: userId -> User Object
    this.users = new Map();
    // Key: normalized email (lowercase) -> userId
    this.userByEmail = new Map();
    // Key: sessionId -> Session Object { id, userId, createdAt, expiresAt }
    this.sessions = new Map();
    // Key: challengeId -> OTP Challenge Object { challengeId, userId, channel, otpHash, expiresAt, attempts, maxAttempts, verified, context }
    this.otpChallenges = new Map();
    // Key: email (lowercase) -> { count, lastFailedAt, lockedUntil }
    this.failedLogins = new Map();
  }

  // User Operations
  getUserById(id) {
    return this.users.get(id) || null;
  }

  getUserByEmail(email) {
    if (!email) return null;
    const userId = this.userByEmail.get(email.toLowerCase().trim());
    if (!userId) return null;
    return this.users.get(userId) || null;
  }

  createUser(userData) {
    const user = {
      id: userData.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      fullName: userData.fullName,
      email: userData.email.toLowerCase().trim(),
      mobile: userData.mobile,
      countryCode: userData.countryCode || '+91',
      passwordHash: userData.passwordHash,
      emailVerified: false,
      mobileVerified: false,
      mfaEnabled: false,
      mfaMethod: null, // 'email' | 'sms' | 'authenticator'
      totpSecret: null,
      createdAt: new Date().toISOString()
    };
    this.users.set(user.id, user);
    this.userByEmail.set(user.email, user.id);
    return user;
  }

  updateUser(id, updates) {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    if (updates.email && updates.email.toLowerCase() !== user.email) {
      this.userByEmail.delete(user.email);
      this.userByEmail.set(updates.email.toLowerCase().trim(), id);
    }
    return updated;
  }

  // Session Operations
  createSession(userId, durationMs = 24 * 60 * 60 * 1000) {
    const sessionId = `sid_${Date.now()}_${Math.random().toString(36).substring(2, 12)}_${Math.random().toString(36).substring(2, 12)}`;
    const now = Date.now();
    const session = {
      id: sessionId,
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + durationMs).toISOString(),
      expiresAtTimestamp: now + durationMs
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAtTimestamp) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  deleteSession(sessionId) {
    if (!sessionId) return false;
    return this.sessions.delete(sessionId);
  }

  // OTP Challenge Operations
  createOtpChallenge({ challengeId, userId, channel, otpHash, expiresInSeconds = 300, maxAttempts = 3, context = {} }) {
    const now = Date.now();
    const challenge = {
      challengeId: challengeId || `ch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      channel, // 'email' | 'sms' | 'mfa_email' | 'mfa_sms' | 'mfa_totp' | 'login'
      otpHash,
      expiresAt: now + expiresInSeconds * 1000,
      expiresAtIso: new Date(now + expiresInSeconds * 1000).toISOString(),
      attempts: 0,
      maxAttempts,
      verified: false,
      context, // e.g. { tempRegistration: true, email: '...', mobile: '...' }
      createdAt: now
    };
    this.otpChallenges.set(challenge.challengeId, challenge);
    return challenge;
  }

  getOtpChallenge(challengeId) {
    if (!challengeId) return null;
    return this.otpChallenges.get(challengeId) || null;
  }

  updateOtpChallenge(challengeId, updates) {
    const challenge = this.otpChallenges.get(challengeId);
    if (!challenge) return null;
    const updated = { ...challenge, ...updates };
    this.otpChallenges.set(challengeId, updated);
    return updated;
  }

  deleteOtpChallenge(challengeId) {
    if (!challengeId) return false;
    return this.otpChallenges.delete(challengeId);
  }

  // Account Lockout / Failed Logins
  recordFailedLogin(email) {
    const key = (email || '').toLowerCase().trim();
    const now = Date.now();
    const entry = this.failedLogins.get(key) || { count: 0, lastFailedAt: now, lockedUntil: 0 };
    entry.count += 1;
    entry.lastFailedAt = now;
    // Lockout after 5 consecutive failed attempts for 5 minutes (300,000ms)
    if (entry.count >= 5) {
      entry.lockedUntil = now + 5 * 60 * 1000;
    }
    this.failedLogins.set(key, entry);
    return entry;
  }

  getFailedLoginStatus(email) {
    const key = (email || '').toLowerCase().trim();
    const entry = this.failedLogins.get(key);
    if (!entry) return { isLocked: false, remainingLockTime: 0, count: 0 };
    const now = Date.now();
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return {
        isLocked: true,
        remainingLockTime: Math.ceil((entry.lockedUntil - now) / 1000),
        count: entry.count
      };
    }
    // If lockout period expired, reset
    if (entry.lockedUntil && entry.lockedUntil <= now) {
      this.failedLogins.delete(key);
      return { isLocked: false, remainingLockTime: 0, count: 0 };
    }
    return { isLocked: false, remainingLockTime: 0, count: entry.count };
  }

  resetFailedLogins(email) {
    const key = (email || '').toLowerCase().trim();
    this.failedLogins.delete(key);
  }
}

const store = new DataStore();

module.exports = store;
