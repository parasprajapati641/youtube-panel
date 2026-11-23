const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Notification = require('../models/Notification');

const generateSessionId = () => crypto.randomBytes(24).toString('hex');

const generateToken = (id, sessionId) => {
  return jwt.sign(
    { id, sessionId },
    process.env.JWT_SECRET || 'smm_super_secret_jwt_key_2026_youtube_panel',
    { expiresIn: '30d' }
  );
};

// @route   POST /api/auth/register
const registerUser = async (req, res) => {
  try {
    const { username, email, password, deviceId, deviceInfo } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    const userExists = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
    });

    if (userExists) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const sessionId = generateSessionId();

    // Device lock is ONLY for role=admin (set on first admin login) – not for user/super_admin
    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user',
      balance: 0,
      isUnlimited: false,
      activeSessionId: sessionId,
      boundDeviceId: null,
      boundDeviceInfo: null,
      boundAt: null,
    });

    return res.status(201).json({
      token: generateToken(user._id, sessionId),
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        isUnlimited: user.isUnlimited,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('[Register Error]', error);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};

// @route   POST /api/auth/login
const loginUser = async (req, res) => {
  try {
    const { login, password, deviceId, deviceInfo } = req.body;

    if (!login || !password) {
      return res.status(400).json({ message: 'Please enter username/email and password' });
    }

    const user = await User.findOne({
      $or: [{ email: login.toLowerCase() }, { username: login.toLowerCase() }],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({
        message:
          user.role === 'admin'
            ? 'Account is deactivated. Contact Super Admin to activate again.'
            : 'Account is blocked. Contact administrator.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // ===== DEVICE LOCK: ONLY role === "admin" =====
    // super_admin + user → no device bind, multi-device allowed
    // admin first login → bind this device
    // admin other device → status=blocked + Super Admin notification
    if (user.role === 'admin') {
      if (!deviceId) {
        return res.status(400).json({
          message: 'Device identification missing. Please refresh the page and try again.',
          code: 'DEVICE_ID_REQUIRED',
        });
      }

      if (!user.boundDeviceId) {
        // First successful login → lock this device permanently until SA resets
        user.boundDeviceId = deviceId;
        user.boundDeviceInfo = deviceInfo || req.headers['user-agent'] || 'Unknown device';
        user.boundAt = new Date();
        console.log(`[Auth] Admin "${user.username}" device bound: ${deviceId.slice(0, 8)}…`);
      } else if (String(user.boundDeviceId) !== String(deviceId)) {
        const ua = deviceInfo || req.headers['user-agent'] || 'Unknown';
        const ip =
          (req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
          req.socket?.remoteAddress ||
          '';

        user.status = 'blocked';
        user.activeSessionId = null;
        await user.save();

        try {
          await Notification.create({
            type: 'device_login_attempt',
            title: 'Admin deactivated – other device login',
            message: `Admin "${user.username}" tried to login from another device. Account DEACTIVATED. Reactivate from User Management (and reset device if needed).`,
            userId: user._id,
            username: user.username,
            meta: {
              attemptedDeviceId: deviceId,
              boundDeviceId: user.boundDeviceId,
              attemptedDeviceInfo: ua,
              boundDeviceInfo: user.boundDeviceInfo,
              ip,
              action: 'account_deactivated',
              time: new Date().toISOString(),
            },
          });
        } catch (notifErr) {
          console.error('[Auth] Notification create failed:', notifErr.message);
        }

        console.warn(
          `[Auth] Admin "${user.username}" wrong device → DEACTIVATED (bound=${user.boundDeviceId?.slice?.(0, 8)} attempted=${deviceId?.slice?.(0, 8)})`
        );

        return res.status(403).json({
          message:
            'Login from another device is not allowed. Your admin account has been DEACTIVATED. Contact Super Admin to activate again.',
          code: 'DEVICE_LOCKED_DEACTIVATED',
        });
      }
    }

    const sessionId = generateSessionId();
    user.activeSessionId = sessionId;
    await user.save();

    return res.json({
      token: generateToken(user._id, sessionId),
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        isUnlimited: user.isUnlimited,
        status: user.status,
        monthlyEarningLimitInr: user.monthlyEarningLimitInr || 0,
        monthlyEarningUsedInr: user.monthlyEarningUsedInr || 0,
        dailyBotLimit: user.dailyBotLimit || 0,
        dailyBotUsed: user.dailyBotUsed || 0,
        dailyLikeUsed: user.dailyLikeUsed || 0,
        dailyCommentUsed: user.dailyCommentUsed || 0,
        lockedChannelId: user.lockedChannelId,
        lockedChannelTitle: user.lockedChannelTitle,
        lockedChannelUrl: user.lockedChannelUrl,
      },
    });
  } catch (error) {
    console.error('[Login Error]', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

// @route   GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      balance: user.balance,
      isUnlimited: user.isUnlimited,
      status: user.status,
      boundDeviceId: user.boundDeviceId ? true : false,
      boundDeviceInfo: user.boundDeviceInfo,
      monthlyEarningLimitInr: user.monthlyEarningLimitInr || 0,
      monthlyEarningUsedInr: user.monthlyEarningUsedInr || 0,
      dailyBotLimit: user.dailyBotLimit || 0,
      dailyBotUsed: user.dailyBotUsed || 0,
      dailyLikeUsed: user.dailyLikeUsed || 0,
      dailyCommentUsed: user.dailyCommentUsed || 0,
      lockedChannelId: user.lockedChannelId,
      lockedChannelTitle: user.lockedChannelTitle,
      lockedChannelUrl: user.lockedChannelUrl,
    });
  } catch (error) {
    console.error('[GetMe Error]', error);
    return res.status(500).json({ message: 'Server error fetching user profile' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
};
