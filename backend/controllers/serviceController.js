const Service = require('../models/Service');

// @route   GET /api/services
// @desc    Get active services list
const getActiveServices = async (req, res) => {
  try {
    const services = await Service.find({ status: 'active' }).sort({ category: 1, name: 1 });
    return res.json(services);
  } catch (error) {
    console.error('[Services Error]', error);
    return res.status(500).json({ message: 'Server error fetching services' });
  }
};

module.exports = {
  getActiveServices,
};
