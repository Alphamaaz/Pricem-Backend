import { verifyAccessToken } from '../utils/jwt.js';
import User from '../modules/users/user.model.js';

// Attach req.user from Bearer token
export async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or deactivated' });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// Guard: user must hold ALL of the specified roles in roles[]
// NEVER checks activeRole — activeRole is UI only
export function requireRole(...roles) {
  return (req, res, next) => {
    const hasAll = roles.every((r) => req.user?.roles.includes(r));
    if (!hasAll) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
}

// Guard: user must hold AT LEAST ONE of the specified roles
export function requireAnyRole(...roles) {
  return (req, res, next) => {
    const hasAny = roles.some((r) => req.user?.roles.includes(r));
    if (!hasAny) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
}
