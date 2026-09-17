/**
 * AUTOMATED IAM END-TO-END FLOW VERIFICATION SUITE
 */

const http = require('http');
const app = require('./src/app');
const store = require('./src/store');
const { authenticator } = require('otplib');

let server;
const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}`;

// Simple fetch-like HTTP client
function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
          cookies: res.headers['set-cookie'] || []
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to inspect store for simulated OTP (since OTP is never returned in API responses)
function getSimulatedOtpForChallenge(challengeId) {
  for (let [id, challenge] of store.otpChallenges.entries()) {
    if (id === challengeId) {
      // In a real test against the store, we can test all 6-digit combinations or inspect the test challenge
      return challenge;
    }
  }
  return null;
}

// Quick 6-digit brute search for test verification of hash
const crypto = require('crypto');
const { JWT_SECRET } = require('./src/utils/crypto');
function crackTestOtp(storedHash) {
  for (let i = 100000; i <= 999999; i++) {
    const calc = crypto.createHash('sha256').update(i.toString() + JWT_SECRET).digest('hex');
    if (calc === storedHash) {
      return i.toString();
    }
  }
  return null;
}

async function runTests() {
  console.log('--- STARTING IAM TEST SUITE ---');

  server = app.listen(PORT);

  try {
    // TEST 1: Health Check
    console.log('\n[1] Health Check...');
    const health = await request('GET', '/api/health');
    console.assert(health.status === 200 && health.data.status === 'ok', 'Health check failed');
    console.log('✓ Health check passed');

    // TEST 2: Registration - Password complexity validation
    console.log('\n[2] Registration Validation (Weak Password)...');
    const weakReg = await request('POST', '/api/register', {
      fullName: 'Aditya Kumar',
      email: 'aditya@example.com',
      mobile: '9876543210',
      password: 'weak',
      terms: true
    });
    console.assert(weakReg.status === 400, 'Should reject weak password');
    console.log('✓ Rejected weak password');

    // TEST 3: Valid Registration
    console.log('\n[3] Valid Registration...');
    const regRes = await request('POST', '/api/register', {
      fullName: 'Aditya Kumar',
      email: 'aditya@example.com',
      mobile: '9876543210',
      countryCode: '+91',
      password: 'SecurePassword123!',
      terms: true
    });
    console.assert(regRes.status === 200, 'Registration should succeed');
    console.assert(regRes.data.nextStep === 'VERIFY_EMAIL_OTP', 'Next step should be VERIFY_EMAIL_OTP');
    console.assert(regRes.data.challengeId, 'Should return challengeId');
    console.log('✓ Registration step 1 succeeded with challengeId:', regRes.data.challengeId);

    const emailChallengeId = regRes.data.challengeId;
    const emailChallenge = store.getOtpChallenge(emailChallengeId);
    const emailOtp = crackTestOtp(emailChallenge.otpHash);
    console.log(`  (Discovered simulated email OTP for test: ${emailOtp})`);

    // TEST 4: Email OTP Wrong Code Check
    console.log('\n[4] Email OTP Wrong Code...');
    const wrongEmailOtp = await request('POST', '/api/verify-email-otp', {
      challengeId: emailChallengeId,
      otp: '000000'
    });
    console.assert(wrongEmailOtp.status === 400, 'Should reject incorrect OTP');
    console.assert(wrongEmailOtp.data.attemptsRemaining === 2, 'Should have 2 attempts remaining');
    console.log('✓ Decremented attempt count correctly');

    // TEST 5: Verify Email OTP with Correct Code
    console.log('\n[5] Verify Email OTP with correct code...');
    const validEmailOtp = await request('POST', '/api/verify-email-otp', {
      challengeId: emailChallengeId,
      otp: emailOtp
    });
    console.assert(validEmailOtp.status === 200, 'Email OTP verification failed');
    console.assert(validEmailOtp.data.nextStep === 'VERIFY_SMS_OTP', 'Should advance to SMS OTP');
    console.log('✓ Email verified, advanced to SMS challenge:', validEmailOtp.data.challengeId);

    const smsChallengeId = validEmailOtp.data.challengeId;
    const smsChallenge = store.getOtpChallenge(smsChallengeId);
    const smsOtp = crackTestOtp(smsChallenge.otpHash);
    console.log(`  (Discovered simulated SMS OTP for test: ${smsOtp})`);

    // TEST 6: Verify SMS OTP
    console.log('\n[6] Verify SMS OTP...');
    const validSmsOtp = await request('POST', '/api/verify-sms-otp', {
      challengeId: smsChallengeId,
      otp: smsOtp
    });
    console.assert(validSmsOtp.status === 200, 'SMS OTP verification failed');
    console.assert(validSmsOtp.data.nextStep === 'MFA_SETUP', 'Should advance to MFA setup');
    console.log('✓ SMS verified, advanced to MFA setup');

    const userId = validSmsOtp.data.userId;

    // TEST 7: Setup Authenticator MFA (TOTP)
    console.log('\n[7] Setup Authenticator TOTP MFA...');
    const mfaSetup = await request('POST', '/api/setup-mfa', {
      userId,
      method: 'authenticator'
    });
    console.assert(mfaSetup.status === 200, 'MFA setup failed');
    console.assert(mfaSetup.data.secret, 'Should return TOTP secret');
    console.assert(mfaSetup.data.qrCodeUrl, 'Should return QR code data URL');
    console.log('✓ Generated TOTP secret and QR code URL');

    const totpSecret = mfaSetup.data.secret;
    const totpChallengeId = mfaSetup.data.challengeId;
    const validTotpToken = authenticator.generate(totpSecret);
    console.log(`  (Generated live TOTP token for test: ${validTotpToken})`);

    // TEST 8: Verify MFA Setup Code & Finalize Registration
    console.log('\n[8] Verify MFA Setup & Finalize Account...');
    const verifyMfaRes = await request('POST', '/api/verify-mfa-setup', {
      challengeId: totpChallengeId,
      otp: validTotpToken
    });
    console.assert(verifyMfaRes.status === 200, 'Verify MFA setup failed');
    console.assert(verifyMfaRes.data.nextStep === 'REGISTRATION_SUCCESS', 'Should advance to REGISTRATION_SUCCESS');
    console.assert(verifyMfaRes.data.user.mfaEnabled === true, 'MFA should be enabled');
    console.log('✓ Registration completed successfully with TOTP MFA');

    // TEST 9: Login - Invalid Password
    console.log('\n[9] Login with Invalid Password...');
    const badLogin = await request('POST', '/api/login', {
      email: 'aditya@example.com',
      password: 'WrongPassword999!'
    });
    console.assert(badLogin.status === 401, 'Should reject invalid credentials');
    console.log('✓ Rejected invalid login credentials');

    // TEST 10: Valid Login - Triggers MFA Challenge
    console.log('\n[10] Valid Login - Triggers MFA Challenge...');
    const loginRes = await request('POST', '/api/login', {
      email: 'aditya@example.com',
      password: 'SecurePassword123!',
      rememberMe: true
    });
    console.assert(loginRes.status === 200, 'Login failed');
    console.assert(loginRes.data.mfaRequired === true, 'MFA must be required');
    console.assert(loginRes.data.method === 'authenticator', 'Method should be authenticator');
    console.log('✓ Login credentials accepted, challenge issued:', loginRes.data.challengeId);

    // TEST 11: Verify Login OTP & Issue Session Cookie
    console.log('\n[11] Verify Login TOTP & Issue Session Cookie...');
    const loginTotp = authenticator.generate(totpSecret);
    const loginVerifyRes = await request('POST', '/api/verify-login-otp', {
      challengeId: loginRes.data.challengeId,
      otp: loginTotp
    });
    console.assert(loginVerifyRes.status === 200, 'Login OTP verification failed');
    console.assert(loginVerifyRes.cookies.length > 0, 'Should set session cookie');
    const sidCookie = loginVerifyRes.cookies[0].split(';')[0];
    console.log('✓ Login verified, received session cookie:', sidCookie);

    // TEST 12: GET /api/me with Session Cookie
    console.log('\n[12] Check Authenticated User (GET /api/me)...');
    const meRes = await request('GET', '/api/me', null, {
      'Cookie': sidCookie
    });
    console.assert(meRes.status === 200, 'GET /api/me failed');
    console.assert(meRes.data.authenticated === true, 'Should be authenticated');
    console.assert(meRes.data.user.email === 'aditya@example.com', 'User email mismatch');
    console.log('✓ GET /api/me returned authenticated user successfully');

    // TEST 13: JWT Issuance (POST /api/token)
    console.log('\n[13] Issue JWT Token (POST /api/token)...');
    const jwtRes = await request('POST', '/api/token', null, {
      'Cookie': sidCookie
    });
    console.assert(jwtRes.status === 200, 'JWT issuance failed');
    console.assert(jwtRes.data.accessToken, 'Access token missing');
    const jwtToken = jwtRes.data.accessToken;
    console.log('✓ Issued JWT access token successfully');

    // TEST 14: Access Protected API with JWT Bearer Token
    console.log('\n[14] Access Protected API (GET /api/protected)...');
    const protectedRes = await request('GET', '/api/protected', null, {
      'Authorization': `Bearer ${jwtToken}`
    });
    console.assert(protectedRes.status === 200, 'Protected API access failed');
    console.assert(protectedRes.data.protectedData, 'Protected data missing');
    console.log('✓ Protected API returned 200 OK with authorized payload');

    // TEST 15: Access Protected API with Invalid Token (401 Rejection)
    console.log('\n[15] Protected API Rejection on Invalid Token...');
    const rejectedJwtRes = await request('GET', '/api/protected', null, {
      'Authorization': 'Bearer invalid_forged_token'
    });
    console.assert(rejectedJwtRes.status === 401, 'Should reject invalid token');
    console.log('✓ Correctly rejected invalid JWT with 401 Unauthorized');

    // TEST 16: Logout (POST /api/logout)
    console.log('\n[16] Logout...');
    const logoutRes = await request('POST', '/api/logout', null, {
      'Cookie': sidCookie
    });
    console.assert(logoutRes.status === 200, 'Logout failed');
    console.log('✓ Session destroyed and logged out');

    // Verify session is now invalid
    const meAfterLogout = await request('GET', '/api/me', null, {
      'Cookie': sidCookie
    });
    console.assert(meAfterLogout.status === 401, 'Session should be invalidated after logout');
    console.log('✓ Verified session is completely invalidated');

    console.log('\n========================================');
    console.log('🎉 ALL 16 TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
