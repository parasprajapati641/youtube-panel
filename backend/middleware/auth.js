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
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'smm_super_secret_jwt_key_2026_youtube_panel');

      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      if (user.status === 'blocked') {
        return res.status(403).json({ message: 'Account is blocked. Contact administrator.' });
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

const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Access denied: Admin role required' });
};

module.exports = { protect, adminOnly };
