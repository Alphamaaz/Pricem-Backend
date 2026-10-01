import bcrypt from 'bcryptjs';
import User from '../users/user.model.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from '../../utils/jwt.js';
import { generateOTP, generateToken, hashToken } from '../../utils/crypto.js';
import { sendEmail, verificationEmailHtml, passwordResetEmailHtml } from '../../utils/email.js';

const OTP_EXPIRY_MS    = 10 * 60 * 1000; // 10 minutes
const RESET_EXPIRY_MS  = 60 * 60 * 1000; // 1 hour

function sendOTPEmail(email, otp, subject) {
  return sendEmail({ to: email, subject, html: verificationEmailHtml(otp) }).catch(console.error);
}

// POST /api/v1/auth/register
export async function register(req, res, next) {
  try {
    const { fullName, email, contactNumber, password } = req.body;

    const existing = await User.findOne({ email }).select('+emailVerificationToken +emailVerificationExpires');

    if (existing) {
      if (existing.emailVerified) {
        return res.status(409).json({ message: 'An account with this email already exists.' });
      }

      // Unverified account — generate fresh OTP and resend
      const otp = generateOTP();
      existing.emailVerificationToken   = hashToken(otp);
      existing.emailVerificationExpires = Date.now() + OTP_EXPIRY_MS;
      await existing.save();

      sendOTPEmail(existing.email, otp, 'Your Pricem verification code');

      return res.status(200).json({
        message: 'A new OTP has been sent to your email. Please verify within 10 minutes.',
        emailVerified: false,
      });
    }

    const otp = generateOTP();
    const user = await User.create({
      fullName,
      email,
      contactNumber,
      password,
      emailVerificationToken:   hashToken(otp),
      emailVerificationExpires: Date.now() + OTP_EXPIRY_MS,
    });

    sendOTPEmail(user.email, otp, 'Your Pricem verification code');

    res.status(201).json({
      message: 'Registration successful. Enter the OTP sent to your email to verify your account.',
      user,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/resend-verification
export async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email }).select('+emailVerificationToken +emailVerificationExpires');

    // Always respond the same way to prevent email enumeration
    if (!user || user.emailVerified) {
      return res.json({ message: 'If that email is registered and unverified, a new OTP has been sent.' });
    }

    const otp = generateOTP();
    user.emailVerificationToken   = hashToken(otp);
    user.emailVerificationExpires = Date.now() + OTP_EXPIRY_MS;
    await user.save();

    sendOTPEmail(user.email, otp, 'Your Pricem verification code');

    res.json({ message: 'If that email is registered and unverified, a new OTP has been sent.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/verify-email
export async function verifyEmail(req, res, next) {
  try {
    const { email, otp } = req.body;
    const hashed = hashToken(otp);

    const user = await User.findOne({ email }).select('+emailVerificationToken +emailVerificationExpires');

    if (
      !user ||
      user.emailVerificationToken !== hashed ||
      user.emailVerificationExpires < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.emailVerified              = true;
    user.emailVerificationToken     = undefined;
    user.emailVerificationExpires   = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/login
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password +refreshToken');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) return res.status(403).json({ message: 'Account is deactivated' });

    if (!user.emailVerified) {
      return res.status(403).json({ message: 'Please verify your email before logging in.' });
    }

    const payload      = { id: user._id, roles: user.roles };
    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken({ id: user._id });

    user.refreshToken = await bcrypt.hash(refreshToken, 10);
    await user.save();

    setRefreshTokenCookie(res, refreshToken);
    res.json({ accessToken, refreshToken, user });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/logout
export async function logout(req, res, next) {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (token) {
      const user = await User.findById(req.user?.id).select('+refreshToken');
      if (user) {
        user.refreshToken = undefined;
        await user.save();
      }
    }
    clearRefreshTokenCookie(res);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/refresh-token
// Web sends refreshToken in httpOnly cookie; Flutter sends it in the request body
export async function refreshToken(req, res, next) {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token' });

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(payload.id).select('+refreshToken');
    if (!user || !user.refreshToken) return res.status(401).json({ message: 'Session expired' });

    const valid = await bcrypt.compare(token, user.refreshToken);
    if (!valid) return res.status(401).json({ message: 'Invalid refresh token' });

    const newAccessToken  = signAccessToken({ id: user._id, roles: user.roles });
    const newRefreshToken = signRefreshToken({ id: user._id });

    user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
    await user.save();

    setRefreshTokenCookie(res, newRefreshToken);
    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/forgot-password
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.json({ message: 'If that email exists, a reset OTP has been sent.' });

    const otp = generateOTP();
    user.passwordResetToken   = hashToken(otp);
    user.passwordResetExpires = Date.now() + RESET_EXPIRY_MS;
    await user.save();

    sendEmail({
      to: user.email,
      subject: 'Pricem password reset OTP',
      html: passwordResetEmailHtml(otp),
    }).catch(console.error);

    res.json({ message: 'If that email exists, a reset OTP has been sent.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/reset-password
export async function resetPassword(req, res, next) {
  try {
    const { email, otp, password } = req.body;
    const hashed = hashToken(otp);

    const user = await User.findOne({ email }).select('+passwordResetToken +passwordResetExpires');

    if (
      !user ||
      user.passwordResetToken !== hashed ||
      user.passwordResetExpires < Date.now()
    ) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.password             = password;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    user.refreshToken         = undefined; // invalidate all sessions
    await user.save();

    clearRefreshTokenCookie(res);
    res.json({ message: 'Password reset successful. Please log in again.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/change-password
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/auth/me
export async function getMe(req, res) {
  res.json({ user: req.user });
}
