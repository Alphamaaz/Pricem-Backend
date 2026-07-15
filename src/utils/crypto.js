import crypto from 'crypto';

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// 6-digit numeric OTP
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
