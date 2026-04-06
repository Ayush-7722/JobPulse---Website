require('dotenv').config();
const { testConnection } = require('../services/email');

async function runTest() {
  console.log('🔍 Testing SMTP Connection...');
  console.log('----------------------------');
  console.log(`User: ${process.env.SMTP_USER || 'Not Set'}`);
  console.log(`Pass: ${process.env.SMTP_PASS ? '********' : 'Not Set'}`);
  console.log(`Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  console.log(`Port: ${process.env.SMTP_PORT || '587'}`);
  console.log('----------------------------');

  const result = await testConnection();

  if (result.success) {
    console.log('✅ SMTP Connection Successful! Your email service is ready.');
  } else {
    console.error('❌ SMTP Connection Failed!');
    console.error(`Reason: ${result.reason}`);
    console.log('\n💡 Troubleshooting Tips:');
    console.log('1. If using Gmail, ensure you are using an "App Password", NOT your regular password.');
    console.log('2. Ensure "Less Secure Apps" is NOT the issue (App Passwords bypass this).');
    console.log('3. Double check SMTP_HOST and SMTP_PORT in your environment variables.');
  }
}

runTest();
