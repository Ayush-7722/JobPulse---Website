/**
 * Email Service - Simplified
 * -------------------------
 * This service is currently in "Console Mode". 
 * It logs OTPs to the server console instead of sending real emails.
 */

// ── Beautiful OTP console template ──
function logOTPConsiderately(name, email, otp) {
  console.log(`\n` + '='.repeat(50));
  console.log(`📧 NEW OTP MAIL (SENT TO CONSOLE)`);
  console.log(`   To:      ${name || 'User'} <${email}>`);
  console.log(`   Subject: ${otp} is your JobPulse verification code`);
  console.log(`   Message: Your verification code is: ${otp}`);
  console.log('='.repeat(50) + `\n`);
}

/**
 * "Sends" an OTP email by logging it to the console.
 * Always returns { sent: true } to maintain the auth flow.
 */
async function sendOTPEmail(toEmail, name, otp) {
  try {
    logOTPConsiderately(name, toEmail, otp);
    return { sent: true, mode: 'console' };
  } catch (err) {
    console.error('❌ Console logging failed:', err.message);
    return { sent: false, reason: 'LOG_FAILURE' };
  }
}

/**
 * Mock connection test (always succeeds in console mode)
 */
async function testConnection() {
  return { success: true, mode: 'console' };
}

module.exports = { 
  sendOTPEmail, 
  testConnection 
};
