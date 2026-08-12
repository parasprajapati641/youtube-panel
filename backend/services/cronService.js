const cron = require('node-cron');
const Order = require('../models/Order');
const ApiProvider = require('../models/ApiProvider');
const User = require('../models/User');
const SmmProviderService = require('./smmProviderService');

const syncOrdersStatus = async () => {
  try {
    // Find all active non-completed orders
    const activeOrders = await Order.find({
      status: { $in: ['Pending', 'In Progress', 'Processing'] },
      providerOrderId: { $ne: '' },
    }).populate({
      path: 'serviceId',
      populate: { path: 'providerId' },
    });

    if (activeOrders.length === 0) {
      return;
    }

    console.log(`[Cron Sync] Processing ${activeOrders.length} pending/in-progress orders...`);

    // Group active orders by ApiProvider
    const providerGroups = {};
    for (const ord of activeOrders) {
      const provider = ord.serviceId?.providerId;
      const providerIdStr = provider ? provider._id.toString() : 'default';

      if (!providerGroups[providerIdStr]) {
        providerGroups[providerIdStr] = {
          provider: provider || null,
          orders: [],
        };
      }
      providerGroups[providerIdStr].orders.push(ord);
    }

    // Process each provider group
    for (const key of Object.keys(providerGroups)) {
      const { provider, orders } = providerGroups[key];
      const providerOrderIds = orders.map((o) => o.providerOrderId);

      const statusMap = await SmmProviderService.getOrderStatus(provider, providerOrderIds);

      for (const ord of orders) {
        const extStatus = statusMap[ord.providerOrderId];
        if (extStatus) {
          let newStatus = ord.status;
          const rawStatus = (extStatus.status || '').toLowerCase();

          if (rawStatus.includes('completed')) {
            newStatus = 'Completed';
          } else if (rawStatus.includes('progress') || rawStatus.includes('processing')) {
            newStatus = 'In Progress';
          } else if (rawStatus.includes('cancel')) {
            newStatus = 'Canceled';
          } else if (rawStatus.includes('partial')) {
            newStatus = 'Partial';
          }

          if (extStatus.remains !== undefined) {
            ord.remains = Number(extStatus.remains) || 0;
          }
          if (extStatus.start_count !== undefined) {
            ord.startCount = Number(extStatus.start_count) || 0;
          }

          if (newStatus !== ord.status) {
            console.log(`[Cron Update] Order #${ord._id.toString().slice(-6)} status: ${ord.status} -> ${newStatus}`);
            ord.status = newStatus;

            // Handle refund if status changed to Canceled
            if (newStatus === 'Canceled') {
              const user = await User.findById(ord.userId);
              if (user && !user.isUnlimited) {
                user.balance = Number((user.balance + ord.totalCost).toFixed(4));
                await user.save();
                console.log(`[Cron Refund] Refunded $${ord.totalCost} to user ${user.username}`);
              }
            }
          }

          await ord.save();
        }
      }
    }
  } catch (error) {
    console.error('[Cron Sync Error]', error.message);
  }
};

const initCron = () => {
  console.log('[Cron Job] Initializing 2-minute multi-provider SMM order status synchronization...');
  // Run every 2 minutes
  cron.schedule('*/2 * * * *', () => {
    syncOrdersStatus();
  });
};

module.exports = {
  initCron,
  syncOrdersStatus,
};
