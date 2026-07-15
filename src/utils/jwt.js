import jwt from 'jsonwebtoken';

export function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '10d',
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '20d',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

// Frontend (Vercel) and backend (Hostinger) are different origins in production,
// so the cookie must be SameSite=None (requires Secure) to survive cross-site
// fetch(). Locally both run on localhost, where 'lax' + non-secure works fine.
const isProduction = process.env.NODE_ENV === 'production';
const refreshCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
};

export function setRefreshTokenCookie(res, token) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const days = parseInt(process.env.JWT_REFRESH_EXPIRES_IN) || 20;
  res.cookie('refreshToken', token, {
    ...refreshCookieOptions,
    maxAge: days * MS_PER_DAY,
  });
}

export function clearRefreshTokenCookie(res) {
  res.cookie('refreshToken', '', { ...refreshCookieOptions, expires: new Date(0) });
}
