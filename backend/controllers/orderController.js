const Order = require('../models/Order');
const Service = require('../models/Service');
const User = require('../models/User');
const ApiProvider = require('../models/ApiProvider');
const SmmProviderService = require('../services/smmProviderService');
const { syncOrdersStatus } = require('../services/cronService');

// @route   POST /api/orders
// @desc    Place a new order & auto-dispatch to external SMM Provider API
const createOrder = async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ message: 'Service, Link, and Quantity are required' });
    }

    const numericQuantity = Number(quantity);
    if (isNaN(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    const service = await Service.findById(serviceId).populate('providerId');
    if (!service || service.status !== 'active') {
      return res.status(404).json({ message: 'Selected service is inactive or not found' });
    }

    if (numericQuantity < service.minQuantity || numericQuantity > service.maxQuantity) {
      return res.status(400).json({
        message: `Quantity must be between ${service.minQuantity} and ${service.maxQuantity}`,
      });
    }

    // Calculate total cost
    const totalCost = Number(((numericQuantity / 1000) * service.ratePer1000).toFixed(4));

    // Get current user profile
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User account not found' });
    }

    // Order Logic: isUnlimited: true OR balance >= totalCost
    if (!user.isUnlimited && user.balance < totalCost) {
      return res.status(400).json({
        message: `Insufficient balance. Required: $${totalCost.toFixed(2)}, Available: $${user.balance.toFixed(2)}. Please add funds.`,
      });
    }

    // Deduct balance if not unlimited testing user
    if (!user.isUnlimited) {
      user.balance = Math.max(0, Number((user.balance - totalCost).toFixed(4)));
      await user.save();
    }

    // Dispatch API POST order to external SMM Provider
    const provider = service.providerId;
    const providerServiceId = service.providerServiceId || service._id.toString();

    console.log(`[Order Controller] Dispatching order for user "${user.username}" (isUnlimited: ${user.isUnlimited})...`);
    
    const providerResult = await SmmProviderService.addOrder(
      provider,
      providerServiceId,
      link.trim(),
      numericQuantity
    );

    let providerOrderId = '';
    let apiErrorDetails = '';
    let initialStatus = 'Pending';

    if (providerResult.success) {
      providerOrderId = providerResult.providerOrderId;
    } else {
      apiErrorDetails = providerResult.error || 'Provider API rejected order';
      initialStatus = 'Canceled';

      // Refund standard user if provider API rejects order immediately
      if (!user.isUnlimited) {
        user.balance = Number((user.balance + totalCost).toFixed(4));
        await user.save();
        console.log(`[Order Refund] Refunded $${totalCost} to ${user.username} due to Provider API Error: ${apiErrorDetails}`);
      }
    }

    const newOrder = await Order.create({
      userId: user._id,
      serviceId: service._id,
      link: link.trim(),
      quantity: numericQuantity,
      totalCost,
      providerOrderId,
      apiErrorDetails,
      remains: numericQuantity,
      status: initialStatus,
    });

    const populatedOrder = await Order.findById(newOrder._id).populate('serviceId', 'name category ratePer1000 speed');

    if (!providerResult.success) {
      return res.status(400).json({
        message: `Provider API Error: ${apiErrorDetails}`,
        order: populatedOrder,
        apiErrorDetails,
        newBalance: user.balance,
      });
    }

    return res.status(201).json({
      message: 'Order placed and dispatched to SMM Provider successfully!',
      order: populatedOrder,
      providerOrderId,
      newBalance: user.balance,
      isUnlimited: user.isUnlimited,
    });
  } catch (error) {
    console.error('[Create Order Error]', error);
    return res.status(500).json({ message: 'Failed to place order. Server error.' });
  }
};

// @route   GET /api/orders/my-orders
// @desc    Get current user's order history with dynamic live status sync
const getMyOrders = async (req, res) => {
  try {
    // 1. Fetch active pending/in-progress orders for this user
    const activeOrders = await Order.find({
      userId: req.user.id,
      status: { $in: ['Pending', 'In Progress', 'Processing'] },
      providerOrderId: { $ne: '' },
    }).populate({
      path: 'serviceId',
      populate: { path: 'providerId' },
    });

    // 2. Perform real-time batch status query to Provider API if active orders exist
    if (activeOrders.length > 0) {
      await syncOrdersStatus(activeOrders);
    }

    // 3. Return user's order history sorted by newest first
    const orders = await Order.find({ userId: req.user.id })
      .populate('serviceId', 'name category ratePer1000 speed')
      .sort({ createdAt: -1 });

    return res.json(orders);
  } catch (error) {
    console.error('[Get My Orders Error]', error);
    return res.status(500).json({ message: 'Error fetching order history' });
  }
};

// @route   GET /api/orders/stats
// @desc    Get user dashboard order stats
const getUserDashboardStats = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const orders = await Order.find({ userId: req.user.id });

    const totalOrders = orders.length;
    const completedOrders = orders.filter((o) => o.status === 'Completed').length;
    const totalSpent = orders.reduce((sum, ord) => sum + (ord.totalCost || 0), 0);

    return res.json({
      balance: user.balance,
      isUnlimited: user.isUnlimited,
      totalOrders,
      completedOrders,
      totalSpent: Number(totalSpent.toFixed(2)),
    });
  } catch (error) {
    console.error('[User Stats Error]', error);
    return res.status(500).json({ message: 'Error loading user dashboard stats' });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getUserDashboardStats,
};
