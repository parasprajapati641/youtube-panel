const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'smm_super_secret_jwt_key_2026_youtube_panel', {
    expiresIn: '30d',
  });
};

// @route   POST /api/auth/register
const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

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

    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'user',
      balance: 0,
      isUnlimited: false,
    });

    return res.status(201).json({
      token: generateToken(user._id),
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
    const { login, password } = req.body; // login can be username or email

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
      return res.status(403).json({ message: 'Account is blocked. Contact administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    return res.json({
      token: generateToken(user._id),
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
