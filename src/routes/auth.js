const express = require('express');
const router = express.Router();
const store = require('../store');
const { hashPassword, comparePassword } = require('../utils/crypto');
const { generateOtp, hashOtp } = require('../utils/crypto');
const { simulateEmailOtp } = require('../utils/notifier');

/**
 * Helper to set Session Cookie
 */
function setSessionCookie(res, sessionId, rememberMe = false) {
  const maxAge = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  res.cookie('sid', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: maxAge,
    path: '/'
  });
}

/**
 * POST /api/register
 * Step 1 of Registration: validate input, create unverified user, send Email OTP
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, mobile, countryCode, password, terms } = req.body;

    // Validate required fields
    if (!fullName || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        error: 'All fields (Full Name, Email, Mobile, Password) are required.'
      });
    }

    if (!terms) {
      return res.status(400).json({
        success: false,
        error: 'You must accept the terms and conditions.'
      });
    }

    // Validate Password Complexity (8+ chars, 1 uppercase, 1 number, 1 special char)
    const hasMinLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    if (!hasMinLength || !hasUpper || !hasNumber || !hasSpecial) {
      return res.status(400).json({
        success: false,
        error: 'Password does not meet complexity requirements.'
      });
    }

    // Check if user already exists
    const existing = store.getUserByEmail(email);
    if (existing && existing.emailVerified && existing.mfaEnabled) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email address already exists. Please log in.'
      });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    let user;
    if (existing) {
      // Re-initialize uncompleted registration
      user = store.updateUser(existing.id, {
        fullName,
        mobile,
        countryCode: countryCode || '+91',
        passwordHash,
        emailVerified: false,
        mobileVerified: false,
        mfaEnabled: false
      });
    } else {
      user = store.createUser({
        fullName,
        email,
        mobile,
        countryCode: countryCode || '+91',
        passwordHash
      });
    }

    // Generate 6-digit Email OTP
    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    // Create OTP Challenge (expires in 5 minutes = 300s)
    const challenge = store.createOtpChallenge({
      userId: user.id,
      channel: 'email',
      otpHash,
      expiresInSeconds: 300,
      maxAttempts: 3,
      context: { email: user.email, mobile: user.mobile }
    });

    // Simulate OTP delivery via server console
    simulateEmailOtp(user.email, otp);

    return res.status(200).json({
      success: true,
      message: 'Registration initiated. Email OTP sent.',
      challengeId: challenge.challengeId,
      channel: 'email',
      email: user.email,
      expiresIn: 300,
      nextStep: 'VERIFY_EMAIL_OTP'
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error during registration.' });
  }
});

/**
 * POST /api/login
 * Step 1 of Login: validate credentials & trigger MFA challenge
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check account lockout status
    const lockout = store.getFailedLoginStatus(normalizedEmail);
    if (lockout.isLocked) {
      return res.status(429).json({
        success: false,
        error: `Account temporarily locked due to multiple failed login attempts. Please try again in ${lockout.remainingLockTime} seconds.`,
        locked: true,
        remainingLockTime: lockout.remainingLockTime
      });
    }

    const user = store.getUserByEmail(normalizedEmail);
    if (!user) {
      store.recordFailedLogin(normalizedEmail);
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password. Please try again.'
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      const failedEntry = store.recordFailedLogin(normalizedEmail);
      if (failedEntry.count >= 5) {
        return res.status(429).json({
          success: false,
          error: 'Account temporarily locked due to 5 failed attempts. Please try again in 5 minutes.',
          locked: true,
          remainingLockTime: 300
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password. Please try again.'
      });
    }

    // Reset failed login counter upon valid password
    store.resetFailedLogins(normalizedEmail);

    // Determine MFA method (default to 'email' if none configured)
    const mfaMethod = user.mfaMethod || 'email';
    let challenge;

    if (mfaMethod === 'authenticator') {
      // Create TOTP challenge
      challenge = store.createOtpChallenge({
        userId: user.id,
        channel: 'mfa_totp',
        otpHash: 'TOTP_DYNAMIC',
        expiresInSeconds: 300,
        maxAttempts: 5,
        context: { rememberMe: !!rememberMe, mfaMethod: 'authenticator' }
      });
    } else if (mfaMethod === 'sms') {
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      challenge = store.createOtpChallenge({
        userId: user.id,
        channel: 'mfa_sms',
        otpHash,
        expiresInSeconds: 300,
        maxAttempts: 3,
        context: { rememberMe: !!rememberMe, mobile: user.mobile, mfaMethod: 'sms' }
      });
      const { simulateSmsOtp } = require('../utils/notifier');
      simulateSmsOtp(`${user.countryCode || '+91'}${user.mobile}`, otp);
    } else {
      // Default to email OTP
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      challenge = store.createOtpChallenge({
        userId: user.id,
        channel: 'mfa_email',
        otpHash,
        expiresInSeconds: 300,
        maxAttempts: 3,
        context: { rememberMe: !!rememberMe, email: user.email, mfaMethod: 'email' }
      });
      simulateEmailOtp(user.email, otp);
    }

    // Mask destination for security
    let maskedDestination = '';
    if (mfaMethod === 'email') {
      const [local, domain] = user.email.split('@');
      maskedDestination = `${local.slice(0, 2)}***@${domain}`;
    } else if (mfaMethod === 'sms') {
      const num = user.mobile;
      maskedDestination = `${user.countryCode || '+91'} ****${num.slice(-4)}`;
    }

    // Backend drives next screen via response shape
    return res.status(200).json({
      success: true,
      mfaRequired: true,
      method: mfaMethod,
      challengeId: challenge.challengeId,
      maskedDestination,
      expiresIn: 300,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error during login.' });
  }
});

/**
 * GET /api/me
 * Returns authenticated user from session cookie
 */
router.get('/me', (req, res) => {
  const sessionId = req.cookies?.sid;
  if (!sessionId) {
    return res.status(401).json({
      authenticated: false,
      error: 'Not authenticated. No active session cookie found.'
    });
  }

  const session = store.getSession(sessionId);
  if (!session) {
    res.clearCookie('sid');
    return res.status(401).json({
      authenticated: false,
      error: 'Session has expired or is invalid.'
    });
  }

  const user = store.getUserById(session.userId);
  if (!user) {
    res.clearCookie('sid');
    return res.status(401).json({
      authenticated: false,
      error: 'User account associated with session not found.'
    });
  }

  return res.status(200).json({
    authenticated: true,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      mobile: user.mobile,
      countryCode: user.countryCode,
      emailVerified: user.emailVerified,
      mobileVerified: user.mobileVerified,
      mfaEnabled: user.mfaEnabled,
      mfaMethod: user.mfaMethod,
      createdAt: user.createdAt
    },
    session: {
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    }
  });
});

/**
 * POST /api/logout
 * Destroys session in store and clears HttpOnly cookie
 */
router.post('/logout', (req, res) => {
  const sessionId = req.cookies?.sid;
  if (sessionId) {
    store.deleteSession(sessionId);
  }
  res.clearCookie('sid', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully. Session destroyed.'
  });
});

module.exports = router;
module.exports.setSessionCookie = setSessionCookie;
