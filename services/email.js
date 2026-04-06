const nodemailer = require('nodemailer');

// ── Create transporter from env variables ──
function createTransporter() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // TLS via STARTTLS
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
}

// ── Beautiful OTP email template ──
function otpEmailHTML(name, otp) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your JobPulse OTP</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:6px;">🚀</div>
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">JobPulse</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Job &amp; Internship Portal</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 8px;color:#64748b;font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Email Verification</p>
            <h2 style="margin:0 0 20px;color:#0f172a;font-size:22px;">Hi ${name || 'there'} 👋</h2>
            <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 28px;">
              You requested to create an account on <strong>JobPulse</strong>. Use the verification code below to confirm your email address.
              This code expires in <strong>10 minutes</strong>.
            </p>

            <!-- OTP Box -->
            <div style="background:#f8fafc;border:2px dashed #6366f1;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
              <p style="margin:0 0 8px;color:#6366f1;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">Your Verification Code</p>
              <div style="font-size:48px;font-weight:800;letter-spacing:12px;color:#0f172a;font-family:'Courier New',monospace;line-height:1;">${otp}</div>
            </div>

            <p style="color:#94a3b8;font-size:13px;margin:0 0 8px;">⏱ This code is valid for <strong>10 minutes</strong> only.</p>
            <p style="color:#94a3b8;font-size:13px;margin:0 0 24px;">🔒 Never share this code with anyone. JobPulse will never ask for it.</p>

            <!-- CTA Note -->
            <div style="background:#eff6ff;border-left:4px solid #6366f1;border-radius:8px;padding:14px 18px;margin-bottom:28px;">
              <p style="margin:0;color:#1e40af;font-size:13px;">
                ℹ️ If you did not request this code, you can safely ignore this email. Your account will not be created.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:13px;">© ${new Date().getFullYear()} JobPulse. All rights reserved.</p>
            <p style="margin:8px 0 0;color:#94a3b8;font-size:12px;">Discover your next opportunity 🚀</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Send OTP Email with 5 attempts ──
async function sendOTPEmail(toEmail, name, otp) {
  const transporter = createTransporter();
  const maxAttempts = 5;

  if (!transporter) {
    // SMTP not configured — log to console in dev mode
    console.log(`\n📧 OTP EMAIL (SMTP not configured)\n   To: ${toEmail}\n   Code: ${otp}\n`);
    return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await transporter.sendMail({
        from: `"JobPulse" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: `${otp} is your JobPulse verification code`,
        html: otpEmailHTML(name, otp),
        text: `Your JobPulse verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
      });
      console.log(`✅ Email sent successfully to ${toEmail} on attempt ${attempt}`);
      return { sent: true, attempts: attempt };
    } catch (err) {
      console.error(`❌ Attempt ${attempt} failed to send email to ${toEmail}: ${err.message}`);
      if (attempt < maxAttempts) {
        console.log(`⏳ Retrying in 1 second...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        return { sent: false, reason: err.message, attempts: maxAttempts };
      }
    }
  }
}

// ── Test Connection ──
async function testConnection() {
  const transporter = createTransporter();
  if (!transporter) return { success: false, reason: 'SMTP_NOT_CONFIGURED' };
  try {
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

module.exports = { sendOTPEmail, testConnection };
