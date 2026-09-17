const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

const JWT_SECRET = process.env.JWT_SECRET || 'iam-demo-jwt-secret-key-99887766554433221100';
const JWT_EXPIRES_IN = '15m';
const BCRYPT_SALT_ROUNDS = 10;

/**
 * Hash plain password using bcrypt
 */
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compare plain password against bcrypt hash
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP
 */
function generateOtp() {
  const num = crypto.randomInt(100000, 1000000); // 100000 to 999999 inclusive
  return num.toString();
}

/**
 * Hash an OTP using SHA-256 with a unique server salt
 */
function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp + JWT_SECRET).digest('hex');
}

/**
 * Verify an incoming OTP against the stored SHA-256 hash
 */
function verifyOtpHash(otp, storedHash) {
  if (!otp || !storedHash) return false;
  const calculated = hashOtp(otp.trim());
  return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(storedHash));
}

/**
 * TOTP (Time-based One Time Password) Utilities
 */
function generateTotpSecret() {
  return authenticator.generateSecret();
}

function generateTotpKeyUri(userEmail, secret) {
  return authenticator.keyuri(userEmail, 'SecureID IAM Demo', secret);
}

async function generateTotpQrCodeDataUrl(keyUri) {
  return QRCode.toDataURL(keyUri);
}

function verifyTotpToken(token, secret) {
  if (!token || !secret) return false;
  return authenticator.check(token.trim(), secret);
}

/**
 * JWT Token Generation and Verification
 */
function signJwt(payload, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  hashPassword,
  comparePassword,
  generateOtp,
  hashOtp,
  verifyOtpHash,
  generateTotpSecret,
  generateTotpKeyUri,
  generateTotpQrCodeDataUrl,
  verifyTotpToken,
  signJwt,
  verifyJwt,
  JWT_SECRET
};
