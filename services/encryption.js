const crypto = require('crypto');

// The encryption key must be an exact 32-byte length for AES-256
// In production, require this via environment variable. 
// For dev/fallback we generate a dummy one (WARNING: Data encrypted with dummy key is lost on reboot!)
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be set in production for PII security.');
  }
  console.warn('⚠️ WARNING: Using fallback encryption key in dev mode. Data will be lost on key rotation.');
  ENCRYPTION_KEY = crypto.scryptSync('fallback_secret_salt', 'salt', 32);
} else if (ENCRYPTION_KEY.length !== 32) {
  // If it's a string from env but not 32 bytes, derive a 32-byte key from it
  ENCRYPTION_KEY = crypto.scryptSync(ENCRYPTION_KEY, 'jobpulse', 32);
}

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16 bytes

function encrypt(text) {
  if (!text) return text;
  
  // If it's already encrypted (we format as hex:hex), skip
  if (text.includes(':')) {
    const parts = text.split(':');
    if (parts.length === 2 && parts[0].length === 32) return text;
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(String(text));
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Return iv:encrypted_data
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (err) {
    console.error('Encryption failed:', err.message);
    return text;
  }
}

function decrypt(text) {
  if (!text) return text;
  
  try {
    const textParts = text.split(':');
    // If it's not our encrypted format, gracefully return raw text
    if (textParts.length !== 2 || textParts[0].length !== 32) return text;

    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  } catch (err) {
    console.error('Decryption failed:', err.message);
    return text; // Gracefully return original if we can't decrypt (e.g. key changed)
  }
}

module.exports = { encrypt, decrypt };
