const express = require('express');
const router = express.Router();
const store = require('../store');
const {
  generateOtp,
  hashOtp,
  verifyOtpHash,
  generateTotpSecret,
  generateTotpKeyUri,
  generateTotpQrCodeDataUrl,
  verifyTotpToken
} = require('../utils/crypto');
const { simulateEmailOtp, simulateSmsOtp } = require('../utils/notifier');
const { setSessionCookie } = require('./auth');

/**
 * POST /api/send-email-otp
 * Resend or initiate Email OTP
 */
router.post('/send-email-otp', (req, res) => {
  try {
    const { challengeId, email, userId } = req.body;
    let targetEmail = email;
    let targetUserId = userId;

    if (challengeId) {
      const prevChallenge = store.getOtpChallenge(challengeId);
      if (prevChallenge) {
        targetUserId = targetUserId || prevChallenge.userId;
        targetEmail = targetEmail || prevChallenge.context?.email;
        // Invalidate old challenge
        store.deleteOtpChallenge(challengeId);
      }
    }

    if (!targetEmail && targetUserId) {
      const user = store.getUserById(targetUserId);
      if (user) targetEmail = user.email;
    }

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email address or valid challengeId is required.'
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    const newChallenge = store.createOtpChallenge({
      userId: targetUserId,
      channel: 'email',
      otpHash,
      expiresInSeconds: 300,
      maxAttempts: 3,
      context: { email: targetEmail }
    });

    simulateEmailOtp(targetEmail, otp);

    return res.status(200).json({
      success: true,
      message: 'New Email OTP sent successfully.',
      challengeId: newChallenge.challengeId,
      expiresIn: 300,
      channel: 'email',
      destination: targetEmail
    });
  } catch (error) {
    console.error('Send Email OTP Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send email OTP.' });
  }
});

/**
 * POST /api/verify-email-otp
 * Verify Email OTP in Registration Flow
 */
router.post('/verify-email-otp', (req, res) => {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Challenge ID and 6-digit OTP code are required.'
      });
    }

    const challenge = store.getOtpChallenge(challengeId);
    if (!challenge) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP challenge. Please request a new code.',
        expired: true
      });
    }

    // Check expiry
    if (Date.now() > challenge.expiresAt) {
      store.deleteOtpChallenge(challengeId);
      return res.status(400).json({
        success: false,
        error: 'This code has expired.',
        expired: true
      });
    }

    // Check max attempts
    if (challenge.attempts >= challenge.maxAttempts) {
      return res.status(400).json({
        success: false,
        error: 'Maximum attempts reached. Please request a new code.',
        maxAttemptsReached: true,
        attemptsRemaining: 0
      });
    }

    // Verify OTP hash
    const isValid = verifyOtpHash(otp, challenge.otpHash);
    if (!isValid) {
      challenge.attempts += 1;
      const attemptsRemaining = challenge.maxAttempts - challenge.attempts;

      if (attemptsRemaining <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Maximum attempts reached. Please request a new code.',
          maxAttemptsReached: true,
          attemptsRemaining: 0
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Incorrect code. Please try again.',
        attemptsRemaining,
        maxAttemptsReached: false
      });
    }

    // Mark verified and single-use invalidate
    store.deleteOtpChallenge(challengeId);

    const user = store.getUserById(challenge.userId);
    if (user) {
      store.updateUser(user.id, { emailVerified: true });
    }

    // Generate SMS OTP automatically for the next registration step
    const smsOtp = generateOtp();
    const smsOtpHash = hashOtp(smsOtp);
    const smsChallenge = store.createOtpChallenge({
      userId: user ? user.id : challenge.userId,
      channel: 'sms',
      otpHash: smsOtpHash,
      expiresInSeconds: 300,
      maxAttempts: 3,
      context: { mobile: user ? user.mobile : null, countryCode: user ? user.countryCode : '+91' }
    });

    if (user && user.mobile) {
      simulateSmsOtp(`${user.countryCode || '+91'}${user.mobile}`, smsOtp);
    }

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully.',
      nextStep: 'VERIFY_SMS_OTP',
      userId: user ? user.id : challenge.userId,
      mobile: user ? user.mobile : '',
      countryCode: user ? user.countryCode : '+91',
      challengeId: smsChallenge.challengeId,
      expiresIn: 300
    });
  } catch (error) {
    console.error('Verify Email OTP Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to verify email OTP.' });
  }
});

/**
 * POST /api/send-sms-otp
 * Resend or update phone number and send SMS OTP
 */
router.post('/send-sms-otp', (req, res) => {
  try {
    const { challengeId, userId, mobile, countryCode } = req.body;
    let targetUserId = userId;
    let targetMobile = mobile;
    let targetCountryCode = countryCode || '+91';

    if (challengeId) {
      const prevChallenge = store.getOtpChallenge(challengeId);
      if (prevChallenge) {
        targetUserId = targetUserId || prevChallenge.userId;
        targetMobile = targetMobile || prevChallenge.context?.mobile;
        targetCountryCode = targetCountryCode || prevChallenge.context?.countryCode || '+91';
        store.deleteOtpChallenge(challengeId);
      }
    }

    if (targetUserId) {
      const user = store.getUserById(targetUserId);
      if (user) {
        if (mobile && mobile !== user.mobile) {
          store.updateUser(user.id, { mobile, countryCode: targetCountryCode });
        }
        targetMobile = mobile || user.mobile;
        targetCountryCode = countryCode || user.countryCode || '+91';
      }
    }

    if (!targetMobile) {
      return res.status(400).json({
        success: false,
        error: 'Mobile phone number is required.'
      });
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);

    const newChallenge = store.createOtpChallenge({
      userId: targetUserId,
      channel: 'sms',
      otpHash,
      expiresInSeconds: 300,
      maxAttempts: 3,
      context: { mobile: targetMobile, countryCode: targetCountryCode }
    });

    simulateSmsOtp(`${targetCountryCode}${targetMobile}`, otp);

    return res.status(200).json({
      success: true,
      message: 'New SMS OTP sent successfully.',
      challengeId: newChallenge.challengeId,
      expiresIn: 300,
      channel: 'sms',
      mobile: targetMobile,
      countryCode: targetCountryCode
    });
  } catch (error) {
    console.error('Send SMS OTP Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send SMS OTP.' });
  }
});

/**
 * POST /api/verify-sms-otp
 * Verify SMS OTP in Registration Flow
 */
router.post('/verify-sms-otp', (req, res) => {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Challenge ID and 6-digit OTP code are required.'
      });
    }

    const challenge = store.getOtpChallenge(challengeId);
    if (!challenge) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP challenge. Please request a new code.',
        expired: true
      });
    }

    if (Date.now() > challenge.expiresAt) {
      store.deleteOtpChallenge(challengeId);
      return res.status(400).json({
        success: false,
        error: 'This code has expired.',
        expired: true
      });
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      return res.status(400).json({
        success: false,
        error: 'Maximum attempts reached. Please request a new code.',
        maxAttemptsReached: true,
        attemptsRemaining: 0
      });
    }

    const isValid = verifyOtpHash(otp, challenge.otpHash);
    if (!isValid) {
      challenge.attempts += 1;
      const attemptsRemaining = challenge.maxAttempts - challenge.attempts;

      if (attemptsRemaining <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Maximum attempts reached. Please request a new code.',
          maxAttemptsReached: true,
          attemptsRemaining: 0
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Incorrect code. Please try again.',
        attemptsRemaining,
        maxAttemptsReached: false
      });
    }

    store.deleteOtpChallenge(challengeId);

    const user = store.getUserById(challenge.userId);
    if (user) {
      store.updateUser(user.id, { mobileVerified: true });
    }

    return res.status(200).json({
      success: true,
      message: 'Mobile number verified successfully.',
      nextStep: 'MFA_SETUP',
      userId: user ? user.id : challenge.userId
    });
  } catch (error) {
    console.error('Verify SMS OTP Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to verify SMS OTP.' });
  }
});

/**
 * POST /api/setup-mfa
 * Configure chosen MFA method (Authenticator TOTP, SMS, or Email)
 */
router.post('/setup-mfa', async (req, res) => {
  try {
    const { userId, method } = req.body;

    if (!userId || !['authenticator', 'sms', 'email'].includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'Valid userId and MFA method (authenticator, sms, or email) are required.'
      });
    }

    const user = store.getUserById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    if (method === 'authenticator') {
      const secret = generateTotpSecret();
      const keyUri = generateTotpKeyUri(user.email, secret);
      const qrCodeUrl = await generateTotpQrCodeDataUrl(keyUri);

      // Temporary challenge for TOTP setup verification
      const challenge = store.createOtpChallenge({
        userId: user.id,
        channel: 'mfa_totp_setup',
        otpHash: secret, // store secret in hash field temporarily for setup
        expiresInSeconds: 600,
        maxAttempts: 5,
        context: { secret, method: 'authenticator' }
      });

      return res.status(200).json({
        success: true,
        method: 'authenticator',
        challengeId: challenge.challengeId,
        secret,
        qrCodeUrl,
        keyUri,
        nextStep: 'VERIFY_MFA_SETUP'
      });
    } else if (method === 'sms') {
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const challenge = store.createOtpChallenge({
        userId: user.id,
        channel: 'mfa_sms_setup',
        otpHash,
        expiresInSeconds: 300,
        maxAttempts: 3,
        context: { method: 'sms', mobile: user.mobile }
      });
      simulateSmsOtp(`${user.countryCode || '+91'}${user.mobile}`, otp);

      return res.status(200).json({
        success: true,
        method: 'sms',
        challengeId: challenge.challengeId,
        destination: `${user.countryCode || '+91'} ${user.mobile}`,
        expiresIn: 300,
        nextStep: 'VERIFY_MFA_SETUP'
      });
    } else {
      // method === 'email'
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const challenge = store.createOtpChallenge({
        userId: user.id,
        channel: 'mfa_email_setup',
        otpHash,
        expiresInSeconds: 300,
        maxAttempts: 3,
        context: { method: 'email', email: user.email }
      });
      simulateEmailOtp(user.email, otp);

      return res.status(200).json({
        success: true,
        method: 'email',
        challengeId: challenge.challengeId,
        destination: user.email,
        expiresIn: 300,
        nextStep: 'VERIFY_MFA_SETUP'
      });
    }
  } catch (error) {
    console.error('Setup MFA Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to initiate MFA setup.' });
  }
});

/**
 * POST /api/verify-mfa-setup
 * Verify MFA setup code and finalize user registration
 */
router.post('/verify-mfa-setup', (req, res) => {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Challenge ID and 6-digit code are required.'
      });
    }

    const challenge = store.getOtpChallenge(challengeId);
    if (!challenge) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired MFA setup session.',
        expired: true
      });
    }

    if (Date.now() > challenge.expiresAt) {
      store.deleteOtpChallenge(challengeId);
      return res.status(400).json({
        success: false,
        error: 'This code has expired. Please try setup again.',
        expired: true
      });
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      return res.status(400).json({
        success: false,
        error: 'Maximum verification attempts exceeded. Please restart MFA setup.',
        maxAttemptsReached: true,
        attemptsRemaining: 0
      });
    }

    const method = challenge.context?.method;
    let isValid = false;

    if (method === 'authenticator') {
      const secret = challenge.context?.secret;
      isValid = verifyTotpToken(otp, secret);
    } else {
      isValid = verifyOtpHash(otp, challenge.otpHash);
    }

    if (!isValid) {
      challenge.attempts += 1;
      const attemptsRemaining = challenge.maxAttempts - challenge.attempts;

      if (attemptsRemaining <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Maximum attempts reached. Please request a new code.',
          maxAttemptsReached: true,
          attemptsRemaining: 0
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Incorrect code. Please try again.',
        attemptsRemaining,
        maxAttemptsReached: false
      });
    }

    // Success! Update User MFA configuration
    store.deleteOtpChallenge(challengeId);
    const updates = {
      mfaEnabled: true,
      mfaMethod: method
    };
    if (method === 'authenticator') {
      updates.totpSecret = challenge.context?.secret;
    }

    const updatedUser = store.updateUser(challenge.userId, updates);

    return res.status(200).json({
      success: true,
      message: 'MFA successfully enabled and verified!',
      nextStep: 'REGISTRATION_SUCCESS',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        mobileVerified: updatedUser.mobileVerified,
        mfaEnabled: updatedUser.mfaEnabled,
        mfaMethod: updatedUser.mfaMethod
      }
    });
  } catch (error) {
    console.error('Verify MFA Setup Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to verify MFA setup.' });
  }
});

/**
 * POST /api/verify-login-otp
 * Verifies login OTP / TOTP, issues session cookie sid and logs user in
 */
router.post('/verify-login-otp', (req, res) => {
  try {
    const { challengeId, otp } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Challenge ID and 6-digit OTP code are required.'
      });
    }

    const challenge = store.getOtpChallenge(challengeId);
    if (!challenge) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired login OTP challenge.',
        expired: true
      });
    }

    if (Date.now() > challenge.expiresAt) {
      store.deleteOtpChallenge(challengeId);
      return res.status(400).json({
        success: false,
        error: 'Code expired. Please request a new code.',
        expired: true
      });
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      return res.status(400).json({
        success: false,
        error: 'Maximum attempts reached. Please request a new code.',
        maxAttemptsReached: true,
        attemptsRemaining: 0
      });
    }

    const user = store.getUserById(challenge.userId);
    if (!user) {
      store.deleteOtpChallenge(challengeId);
      return res.status(404).json({
        success: false,
        error: 'User not found.'
      });
    }

    let isValid = false;
    if (challenge.channel === 'mfa_totp') {
      isValid = verifyTotpToken(otp, user.totpSecret);
    } else {
      isValid = verifyOtpHash(otp, challenge.otpHash);
    }

    if (!isValid) {
      challenge.attempts += 1;
      const attemptsRemaining = challenge.maxAttempts - challenge.attempts;

      if (attemptsRemaining <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Maximum attempts reached. Please request a new code.',
          maxAttemptsReached: true,
          attemptsRemaining: 0
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Incorrect code. Please try again.',
        attemptsRemaining,
        maxAttemptsReached: false
      });
    }

    // Invalidate challenge
    store.deleteOtpChallenge(challengeId);

    // Create session & Set HttpOnly cookie
    const rememberMe = challenge.context?.rememberMe || false;
    const session = store.createSession(user.id, rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000);
    setSessionCookie(res, session.id, rememberMe);

    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      authenticated: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        countryCode: user.countryCode,
        mfaMethod: user.mfaMethod,
        emailVerified: user.emailVerified,
        mobileVerified: user.mobileVerified
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt
      },
      redirect: '/dashboard'
    });
  } catch (error) {
    console.error('Verify Login OTP Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to verify login OTP.' });
  }
});

/**
 * POST /api/resend-login-otp
 * Resends login OTP for SMS/Email
 */
router.post('/resend-login-otp', (req, res) => {
  try {
    const { challengeId } = req.body;
    if (!challengeId) {
      return res.status(400).json({ success: false, error: 'Challenge ID is required.' });
    }

    const prevChallenge = store.getOtpChallenge(challengeId);
    if (!prevChallenge) {
      return res.status(400).json({ success: false, error: 'Challenge not found or expired.' });
    }

    const user = store.getUserById(prevChallenge.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    store.deleteOtpChallenge(challengeId);

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const mfaMethod = prevChallenge.context?.mfaMethod || user.mfaMethod || 'email';

    const newChallenge = store.createOtpChallenge({
      userId: user.id,
      channel: `mfa_${mfaMethod}`,
      otpHash,
      expiresInSeconds: 300,
      maxAttempts: 3,
      context: { ...prevChallenge.context, mfaMethod }
    });

    if (mfaMethod === 'sms') {
      simulateSmsOtp(`${user.countryCode || '+91'}${user.mobile}`, otp);
    } else {
      simulateEmailOtp(user.email, otp);
    }

    return res.status(200).json({
      success: true,
      message: `New ${mfaMethod.toUpperCase()} OTP sent.`,
      challengeId: newChallenge.challengeId,
      expiresIn: 300,
      method: mfaMethod
    });
  } catch (error) {
    console.error('Resend Login OTP Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to resend login OTP.' });
  }
});

module.exports = router;
