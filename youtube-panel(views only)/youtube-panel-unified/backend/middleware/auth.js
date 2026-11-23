const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'smm_super_secret_jwt_key_2026_youtube_panel'
      );

      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (user.status === 'blocked') {
        return res.status(403).json({
          message: 'Account is blocked. Contact administrator.',
        });
      }

      if (
        decoded.sessionId &&
        user.activeSessionId &&
        decoded.sessionId !== user.activeSessionId
      ) {
        return res.status(401).json({
          message: 'Logged in from another device. Please login again.',
          code: 'SESSION_EXPIRED',
        });
      }

      req.user = user;
      return next();
    } catch (error) {
      console.error('[Auth Error]', error.message);
      return res.status(401).json({ message: 'Not authorized, token invalid' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }
};

/** Super admin only – full system access */
const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    return next();
  }
  return res.status(403).json({ message: 'Access denied: Super Admin required' });
};

/**
 * Admin panel access: super_admin OR admin
 * (legacy adminOnly name kept for existing routes)
 */
const adminOnly = (req, res, next) => {
  if (req.user && (req.user.role === 'super_admin' || req.user.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied: Admin role required' });
};

module.exports = { protect, adminOnly, superAdminOnly };
