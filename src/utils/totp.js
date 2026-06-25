import crypto from 'crypto';

// Base32 decoding helper
function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = base32.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < clean.length; i++) {
    const val = alphabet.indexOf(clean[i]);
    if (val === -1) {
      throw new Error('Invalid base32 character');
    }
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xFF);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Verify a TOTP token (supports window of +/- 1 time step for clock drift)
 * @param {string} token
 * @param {string} secretBase32
 * @param {number} window
 * @param {number} timeStep
 * @returns {boolean}
 */
export function verifyTOTP(token, secretBase32, window = 1, timeStep = 30) {
  try {
    const key = base32Decode(secretBase32);
    const epoch = Math.floor(Date.now() / 1000);
    const currentCounter = Math.floor(epoch / timeStep);

    for (let i = -window; i <= window; i++) {
      const counter = currentCounter + i;
      const buffer = Buffer.alloc(8);
      let tmp = counter;
      for (let j = 7; j >= 0; j--) {
        buffer[j] = tmp & 0xff;
        tmp = tmp >> 8;
      }

      const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
      const offset = hmac[hmac.length - 1] & 0xf;
      const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

      const otp = code % 1000000;
      if (String(otp).padStart(6, '0') === token) {
        return true;
      }
    }
  } catch (error) {
    // Return false on invalid base32 or decoding errors
  }
  return false;
}

/**
 * Generate a random Base32 secret for TOTP setup
 * @param {number} length
 * @returns {string}
 */
export function generateSecret(length = 16) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const randomBytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < randomBytes.length; i++) {
    secret += alphabet[randomBytes[i] % alphabet.length];
  }
  return secret;
}
