const User = require('../models/User');

// @route   POST /api/users/add-funds-mock
// @desc    Add funds to current user balance (for testing / mockup)
const addFundsMock = async (req, res) => {
  try {
    const { amount } = req.body;
    const numericAmount = Number(amount);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.balance = Number((user.balance + numericAmount).toFixed(2));
    await user.save();

    return res.json({
      message: `Successfully added $${numericAmount.toFixed(2)} to your balance!`,
      newBalance: user.balance,
    });
  } catch (error) {
    console.error('[Add Funds Error]', error);
    return res.status(500).json({ message: 'Server error processing deposit request' });
  }
};

module.exports = {
  addFundsMock,
};
