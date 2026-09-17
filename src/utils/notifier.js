/**
 * SIMULATED NOTIFIER
 * Outputs formatted logs simulating real-world email and SMS delivery.
 * In a production IAM system, these would call SendGrid, AWS SES, Twilio, etc.
 */

function simulateEmailOtp(email, otp) {
  const line = '='.repeat(60);
  console.log(`\n${line}`);
  console.log(`[SIMULATED EMAIL] To: ${email} OTP: ${otp}`);
  console.log(`[SIMULATED EMAIL] Timestamp: ${new Date().toISOString()}`);
  console.log(`${line}\n`);
}

function simulateSmsOtp(mobile, otp) {
  const line = '='.repeat(60);
  console.log(`\n${line}`);
  console.log(`[SIMULATED SMS] To: ${mobile} OTP: ${otp}`);
  console.log(`[SIMULATED SMS] Timestamp: ${new Date().toISOString()}`);
  console.log(`${line}\n`);
}

module.exports = {
  simulateEmailOtp,
  simulateSmsOtp
};
