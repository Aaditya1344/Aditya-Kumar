const express = require('express');
const router = express.Router();
const store = require('../store');
const { signJwt, verifyJwt } = require('../utils/crypto');

/**
 * Middleware: Verify Bearer JWT Token
 */
function authenticateJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or malformed Authorization header. Expected format: "Authorization: Bearer <token>"'
    });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyJwt(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired JWT token.'
    });
  }

  req.jwtUser = decoded;
  next();
}

/**
 * POST /api/token
 * Issues a short-lived JWT token (demonstrating independent JWT flow)
 */
router.post('/token', (req, res) => {
  try {
    let user = null;

    // Check if called with an active session cookie
    const sessionId = req.cookies?.sid;
    if (sessionId) {
      const session = store.getSession(sessionId);
      if (session) {
        user = store.getUserById(session.userId);
      }
    }

    // Or if passed directly in request body
    if (!user && req.body?.userId) {
      user = store.getUserById(req.body.userId);
    }

    // Default fallback demo user if no session
    if (!user) {
      user = {
        id: 'usr_jwt_demo_999',
        fullName: 'Demo IAM Explorer',
        email: 'iam-explorer@example.com',
        role: 'security_auditor'
      };
    }

    const payload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role || 'authenticated_user',
      iss: 'secureid-iam-auth-service',
      aud: 'secureid-api'
    };

    const token = signJwt(payload, '15m');

    return res.status(200).json({
      success: true,
      tokenType: 'Bearer',
      accessToken: token,
      expiresIn: '15m (900 seconds)',
      issuedAt: new Date().toISOString(),
      claims: payload
    });
  } catch (error) {
    console.error('Issue JWT Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to issue JWT token.' });
  }
});

/**
 * GET /api/protected
 * Protected resource accessible ONLY via valid JWT Bearer header
 */
router.get('/protected', authenticateJwt, (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Access granted! You have successfully accessed a protected resource using JWT Bearer authentication.',
    authenticationMethod: 'JWT Bearer Token',
    tokenClaims: req.jwtUser,
    protectedData: {
      resourceId: 'res_vault_top_secret_442',
      classification: 'RESTRICTED / CONFIDENTIAL',
      serverTimestamp: new Date().toISOString(),
      iamFeaturesEnabled: [
        'Multi-Factor Authentication (OTP / TOTP)',
        'HttpOnly SameSite Session Cookies',
        'Stateless JWT Verification Middleware',
        'Brute-force Account Lockout Protection',
        'Cryptographic Timing-Safe Hash Verification'
      ]
    }
  });
});

module.exports = router;
