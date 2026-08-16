const User = require('../models/User');
const Service = require('../models/Service');
const Order = require('../models/Order');
const Setting = require('../models/Setting');

// @route   GET /api/admin/stats
// @desc    Get high level admin dashboard analytics
const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    
    // Total revenue from all non-cancelled orders
    const validOrders = await Order.find({ status: { $ne: 'Cancelled' } });
    const totalRevenue = validOrders.reduce((sum, o) => sum + (o.totalCost || 0), 0);

    // Total system balance held across user accounts
    const allUsers = await User.find();
    const systemBalance = allUsers.reduce((sum, u) => sum + (u.balance || 0), 0);

    // Recent orders count by status
    const pendingOrders = await Order.countDocuments({ status: 'Pending' });
    const inProgressOrders = await Order.countDocuments({ status: 'In Progress' });
    const completedOrders = await Order.countDocuments({ status: 'Completed' });
    const cancelledOrders = await Order.countDocuments({ status: 'Cancelled' });

    return res.json({
      totalUsers,
      totalOrders,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      systemBalance: Number(systemBalance.toFixed(2)),
      statusBreakdown: {
        pending: pendingOrders,
        inProgress: inProgressOrders,
        completed: completedOrders,
        cancelled: cancelledOrders,
      },
    });
  } catch (error) {
    console.error('[Admin Stats Error]', error);
    return res.status(500).json({ message: 'Error loading admin analytics' });
  }
};

// @route   GET /api/admin/users
// @desc    View all registered users
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return res.json(users);
  } catch (error) {
    console.error('[Admin Get Users Error]', error);
    return res.status(500).json({ message: 'Error fetching user list' });
  }
};

// @route   PUT /api/admin/users/:id
// @desc    Update user balance, toggle isUnlimited, role, or block/unblock status
const updateUser = async (req, res) => {
  try {
    const { balance, isUnlimited, role, status } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (balance !== undefined) {
      user.balance = Math.max(0, Number(balance));
    }
    if (isUnlimited !== undefined) {
      user.isUnlimited = Boolean(isUnlimited);
    }
    if (role !== undefined && ['user', 'admin'].includes(role)) {
      user.role = role;
    }
    if (status !== undefined && ['active', 'blocked'].includes(status)) {
      user.status = status;
    }

    await user.save();

    return res.json({
      message: 'User updated successfully',
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
    console.error('[Admin Update User Error]', error);
    return res.status(500).json({ message: 'Error updating user' });
  }
};

// @route   GET /api/admin/services
// @desc    Get all services including inactive ones
const getAdminServices = async (req, res) => {
  try {
    const services = await Service.find().sort({ category: 1, name: 1 });
    return res.json(services);
  } catch (error) {
    console.error('[Admin Get Services Error]', error);
    return res.status(500).json({ message: 'Error fetching services' });
  }
};

// @route   POST /api/admin/services
// @desc    Create new service
const createService = async (req, res) => {
  try {
    const { name, category, ratePer1000, minQuantity, maxQuantity, status, providerApiUrl, providerServiceId, description } = req.body;

    if (!name || !category || ratePer1000 === undefined) {
      return res.status(400).json({ message: 'Name, Category, and Rate per 1000 are required' });
    }

    const service = await Service.create({
      name,
      category,
      ratePer1000: Number(ratePer1000),
      minQuantity: minQuantity ? Number(minQuantity) : 100,
      maxQuantity: maxQuantity ? Number(maxQuantity) : 100000,
      status: status || 'active',
      providerApiUrl: providerApiUrl || '',
      providerServiceId: providerServiceId || '',
      description: description || '',
    });

    return res.status(201).json({ message: 'Service created successfully', service });
  } catch (error) {
    console.error('[Create Service Error]', error);
    return res.status(500).json({ message: 'Error creating service' });
  }
};

// @route   PUT /api/admin/services/:id
// @desc    Update an existing service
const updateService = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    const fields = ['name', 'category', 'ratePer1000', 'minQuantity', 'maxQuantity', 'status', 'providerApiUrl', 'providerServiceId', 'description'];
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        service[field] = req.body[field];
      }
    });

    await service.save();
    return res.json({ message: 'Service updated successfully', service });
  } catch (error) {
    console.error('[Update Service Error]', error);
    return res.status(500).json({ message: 'Error updating service' });
  }
};

// @route   DELETE /api/admin/services/:id
// @desc    Delete a service
const deleteService = async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    return res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    console.error('[Delete Service Error]', error);
    return res.status(500).json({ message: 'Error deleting service' });
  }
};

// @route   GET /api/admin/orders
// @desc    View all orders in system with populated user & service info and real-time status sync
const getAllOrders = async (req, res) => {
  try {
    const { syncOrdersStatus } = require('../services/cronService');
    const activeOrders = await Order.find({
      status: { $in: ['Pending', 'In Progress', 'Processing'] },
      providerOrderId: { $ne: '' },
    }).populate({
      path: 'serviceId',
      populate: { path: 'providerId' },
    });

    if (activeOrders.length > 0) {
      await syncOrdersStatus(activeOrders);
    }

    const orders = await Order.find()
      .populate('userId', 'username email balance isUnlimited')
      .populate('serviceId', 'name category ratePer1000')
      .sort({ createdAt: -1 });

    return res.json(orders);
  } catch (error) {
    console.error('[Admin Get Orders Error]', error);
    return res.status(500).json({ message: 'Error fetching order list' });
  }
};

// @route   PUT /api/admin/orders/:id/status
// @desc    Manually update order status (Pending, In Progress, Completed, Cancelled)
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const oldStatus = order.status;
    order.status = status;
    await order.save();

    // If order was cancelled and was previously not cancelled, refund user if not isUnlimited
    if (status === 'Cancelled' && oldStatus !== 'Cancelled') {
      const user = await User.findById(order.userId);
      if (user && !user.isUnlimited) {
        user.balance = Number((user.balance + order.totalCost).toFixed(4));
        await user.save();
      }
    }

    return res.json({ message: `Order status updated to ${status}`, order });
  } catch (error) {
    console.error('[Admin Update Order Error]', error);
    return res.status(500).json({ message: 'Error updating order status' });
  }
};

// @route   GET /api/admin/settings
// @desc    Get API Provider settings and profit margin configurations
const getSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({
        providerApiKey: '8678863199f629b7d2564662ec9d8f03',
        providerApiUrl: 'https://smmshiba.com/api/v2',
        siteName: 'YouTube & Social SMM Panel',
        defaultProfitMargin: 20,
        categoryMargins: {},
      });
    }
    return res.json(settings);
  } catch (error) {
    console.error('[Admin Get Settings Error]', error);
    return res.status(500).json({ message: 'Error fetching settings' });
  }
};

// @route   PUT /api/admin/settings
// @desc    Update API Provider settings and profit margin rules
const updateSettings = async (req, res) => {
  try {
    const { providerApiKey, providerApiUrl, siteName, defaultProfitMargin, categoryMargins } = req.body;

    let settings = await Setting.findOne();
    if (!settings) {
      settings = new Setting();
    }

    if (providerApiKey !== undefined) settings.providerApiKey = providerApiKey;
    if (providerApiUrl !== undefined) settings.providerApiUrl = providerApiUrl;
    if (siteName !== undefined) settings.siteName = siteName;
    if (defaultProfitMargin !== undefined) settings.defaultProfitMargin = Math.max(0, Number(defaultProfitMargin));
    if (categoryMargins !== undefined) settings.categoryMargins = categoryMargins;
    settings.updatedAt = Date.now();

    await settings.save();
    return res.json({ message: 'Settings saved successfully', settings });
  } catch (error) {
    console.error('[Admin Update Settings Error]', error);
    return res.status(500).json({ message: 'Error saving settings' });
  }
};

// @route   POST /api/admin/orders/sync
// @desc    Force immediate status sync with external SMM provider APIs
const forceSyncOrders = async (req, res) => {
  try {
    const { syncOrdersStatus } = require('../services/cronService');
    await syncOrdersStatus();
    return res.json({ message: 'Live order status sync completed with provider APIs!' });
  } catch (error) {
    console.error('[Force Sync Error]', error);
    return res.status(500).json({ message: 'Error syncing order statuses' });
  }
};

// @route   POST /api/admin/services/sync-smmshiba
// @desc    Sync catalog from SMMShiba API and update rates with dynamic profit margin formula
const syncSmmShibaCatalog = async (req, res) => {
  try {
    const { syncSmmShibaServices } = require('../services/syncService');
    const result = await syncSmmShibaServices();

    if (result.success) {
      return res.json({
        message: `Successfully synchronized SMMShiba catalog! (${result.totalFetched} services processed, ${result.addedCount} new added, ${result.updatedCount} updated)`,
        result,
      });
    } else {
      return res.status(500).json({
        message: result.error || 'Failed to sync SMMShiba services',
      });
    }
  } catch (error) {
    console.error('[Sync SMMShiba Controller Error]', error);
    return res.status(500).json({ message: 'Error triggering SMMShiba catalog sync' });
  }
};

// @route   POST /api/admin/orders/:id/refill
// @desc    Trigger provider order refill action for an existing order
const refillOrder = async (req, res) => {
  try {
    const SmmProviderService = require('../services/smmProviderService');
    const order = await Order.findById(req.params.id).populate({
      path: 'serviceId',
      populate: { path: 'providerId' },
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!order.providerOrderId) {
      return res.status(400).json({ message: 'Order has no external provider order ID to refill' });
    }

    const provider = order.serviceId?.providerId;
    const refillResult = await SmmProviderService.requestRefill(provider, order.providerOrderId);

    if (refillResult.success) {
      return res.json({
        message: `Refill request submitted successfully! (Refill ID: ${refillResult.refillId})`,
        refillResult,
      });
    } else {
      return res.status(400).json({
        message: refillResult.error || 'Provider rejected refill request',
        refillResult,
      });
    }
  } catch (error) {
    console.error('[Admin Order Refill Error]', error);
    return res.status(500).json({ message: 'Failed to request order refill' });
  }
};

// @route   GET /api/admin/smmshiba/balance
// @desc    Get live SMMShiba provider balance
const getSmmShibaBalance = async (req, res) => {
  try {
    const { getOrUpdateSmmShibaProvider } = require('../services/syncService');
    const SmmProviderService = require('../services/smmProviderService');

    const provider = await getOrUpdateSmmShibaProvider();
    const result = await SmmProviderService.getProviderBalance(provider);

    const balance = result.balance !== undefined ? Number(result.balance) : provider.balance;
    provider.balance = balance;
    await provider.save();

    return res.json({
      balance,
      currency: result.currency || 'USD',
      providerName: provider.name,
    });
  } catch (error) {
    console.error('[Get SMMShiba Balance Error]', error);
    return res.status(500).json({ message: 'Error fetching SMMShiba provider balance', balance: 0 });
  }
};

module.exports = {
  getAdminStats,
  getAllUsers,
  updateUser,
  getAdminServices,
  createService,
  updateService,
  deleteService,
  getAllOrders,
  updateOrderStatus,
  forceSyncOrders,
  getSettings,
  updateSettings,
  syncSmmShibaCatalog,
  refillOrder,
  getSmmShibaBalance,
};
