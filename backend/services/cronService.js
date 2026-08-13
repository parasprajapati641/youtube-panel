const cron = require('node-cron');
const Order = require('../models/Order');
const ApiProvider = require('../models/ApiProvider');
const User = require('../models/User');
const SmmProviderService = require('./smmProviderService');

const syncOrdersStatus = async (inputOrders = null) => {
  try {
    let activeOrders = inputOrders;

    if (!activeOrders) {
      // Find all active non-completed orders across system
      activeOrders = await Order.find({
        status: { $in: ['Pending', 'In Progress', 'Processing'] },
        providerOrderId: { $ne: '' },
      }).populate({
        path: 'serviceId',
        populate: { path: 'providerId' },
      });
    }

    if (!activeOrders || activeOrders.length === 0) {
      return { syncedCount: 0, updatedCount: 0 };
    }

    console.log(`[Order Sync] Processing ${activeOrders.length} pending/in-progress orders...`);

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

    let updatedCount = 0;

    // Process each provider group
    for (const key of Object.keys(providerGroups)) {
      const { provider, orders } = providerGroups[key];
      const providerOrderIds = orders.map((o) => o.providerOrderId).filter(Boolean);

      if (providerOrderIds.length === 0) continue;

      const statusMap = await SmmProviderService.getOrderStatus(provider, providerOrderIds);

      for (const ord of orders) {
        // Handle both map response { "123": { status: "..." } } and direct object { status: "..." }
        const extStatus = statusMap[ord.providerOrderId] || (statusMap.status ? statusMap : null);

        if (extStatus) {
          let newStatus = ord.status;
          const rawStatus = String(extStatus.status || '').toLowerCase();

          if (rawStatus.includes('completed')) {
            newStatus = 'Completed';
          } else if (rawStatus.includes('progress') || rawStatus.includes('processing') || rawStatus.includes('inprogress')) {
            newStatus = 'In Progress';
          } else if (rawStatus.includes('cancel')) {
            newStatus = 'Canceled';
          } else if (rawStatus.includes('partial')) {
            newStatus = 'Partial';
          } else if (rawStatus.includes('pending')) {
            newStatus = 'Pending';
          }

          let remainsUpdated = false;
          let startCountUpdated = false;

          if (extStatus.remains !== undefined && extStatus.remains !== null && extStatus.remains !== '') {
            const parsedRemains = Number(extStatus.remains);
            if (!isNaN(parsedRemains) && ord.remains !== parsedRemains) {
              ord.remains = parsedRemains;
              remainsUpdated = true;
            }
          }

          if (extStatus.start_count !== undefined && extStatus.start_count !== null && extStatus.start_count !== '') {
            const parsedStartCount = Number(extStatus.start_count);
            if (!isNaN(parsedStartCount) && ord.startCount !== parsedStartCount) {
              ord.startCount = parsedStartCount;
              startCountUpdated = true;
            }
          }

          const statusChanged = newStatus !== ord.status;

          if (statusChanged || remainsUpdated || startCountUpdated) {
            if (statusChanged) {
              console.log(`[Order Status Update] Order #${ord._id.toString().slice(-6)} (Ext: ${ord.providerOrderId}): ${ord.status} -> ${newStatus}`);
              ord.status = newStatus;
            }

            // Handle refund if status changed to Canceled
            if (statusChanged && newStatus === 'Canceled') {
              const user = await User.findById(ord.userId);
              if (user && !user.isUnlimited) {
                user.balance = Number((user.balance + ord.totalCost).toFixed(4));
                await user.save();
                console.log(`[Cron Refund] Refunded $${ord.totalCost} to user ${user.username}`);
              }
            }
            await ord.save();
            updatedCount++;
          }
        }
      }
    }

    return { syncedCount: activeOrders.length, updatedCount };
  } catch (error) {
    console.error('[Order Sync Error]', error.message);
    return { error: error.message };
  }
};

const initCron = () => {
  console.log('[Cron Job] Initializing 2-minute multi-provider SMM order status synchronization...');
  cron.schedule('*/2 * * * *', () => {
    syncOrdersStatus();
  });
};

module.exports = {
  initCron,
  syncOrdersStatus,
};
