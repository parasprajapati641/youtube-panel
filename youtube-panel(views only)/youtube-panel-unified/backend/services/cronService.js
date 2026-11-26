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

    // Avoid spam: only log when count changes or every ~10th run
    if (!syncOrdersStatus._lastLoggedCount || syncOrdersStatus._lastLoggedCount !== activeOrders.length) {
      console.log(`[Order Sync] Processing ${activeOrders.length} pending/in-progress orders...`);
      syncOrdersStatus._lastLoggedCount = activeOrders.length;
      syncOrdersStatus._logSkip = 0;
    } else {
      syncOrdersStatus._logSkip = (syncOrdersStatus._logSkip || 0) + 1;
      if (syncOrdersStatus._logSkip >= 15) {
        console.log(`[Order Sync] still ${activeOrders.length} in progress…`);
        syncOrdersStatus._logSkip = 0;
      }
    }

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

      // Local Playwright bot orders (LOCAL-*) – only complete when job actually finished
      const localOrders = orders.filter((o) => String(o.providerOrderId || '').startsWith('LOCAL-'));
      if (localOrders.length > 0) {
        let localBotService;
        try {
          localBotService = require('./localBotService');
        } catch (_) {
          localBotService = null;
        }
        const localIds = localOrders.map((o) => o.providerOrderId);
        let statusMap = {};
        if (localBotService && localBotService.getOrderStatus) {
          statusMap = await localBotService.getOrderStatus(null, localIds);
        }
        for (const ord of localOrders) {
          const ext = statusMap[ord.providerOrderId] || {};
          const raw = String(ext.status || ord.status || 'In Progress').toLowerCase();
          let newStatus = ord.status;
          if (raw.includes('complete')) newStatus = 'Completed';
          else if (raw.includes('partial')) newStatus = 'Partial';
          else if (raw.includes('cancel') || raw.includes('fail')) newStatus = 'Canceled';
          else if (raw.includes('progress') || raw.includes('pending') || raw.includes('processing')) {
            if (ext.live) newStatus = 'In Progress';
            else if (ext.stale) newStatus = 'Canceled';
            else newStatus = 'In Progress';
          }
          if (newStatus === 'Completed' && ord.status !== 'Completed') {
            ord.status = 'Completed';
            ord.remains = 0;
            await ord.save();
            updatedCount++;
            console.log(`[Order Status] Local bot order #${ord._id.toString().slice(-6)} → Completed`);
          } else if (newStatus === 'Partial' && ord.status !== 'Partial') {
            ord.status = 'Partial';
            if (ext.remains != null) ord.remains = ext.remains;
            if (ext.startCount != null) ord.startCount = ext.startCount;
            await ord.save();
            updatedCount++;
            console.log(`[Order Status] Local bot order #${ord._id.toString().slice(-6)} → Partial`);
          } else if (newStatus === 'Canceled' && ord.status !== 'Canceled') {
            ord.status = 'Canceled';
            await ord.save();
            updatedCount++;
            console.log(`[Order Status] Local bot order #${ord._id.toString().slice(-6)} → Canceled`);
          } else if (ord.status === 'Pending') {
            ord.status = 'In Progress';
            await ord.save();
            updatedCount++;
          }
        }
      }

      const remoteOrders = orders.filter((o) => !String(o.providerOrderId || '').startsWith('LOCAL-'));
      if (remoteOrders.length === 0) continue;

      const remoteIds = remoteOrders.map((o) => o.providerOrderId).filter(Boolean);
      const statusMap = await SmmProviderService.getOrderStatus(provider, remoteIds);

      for (const ord of remoteOrders) {
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
  console.log('[Cron Job] Order status sync every 2 min (LOCAL jobs complete only when bot finishes)');
  // After PM2/restart: close LOCAL orders whose browser job is no longer in memory
  try {
    const localBotService = require('./localBotService');
    if (localBotService.finalizeStaleLocalOrders) {
      localBotService.finalizeStaleLocalOrders().then((r) => {
        if (r && r.closed) console.log(`[LocalBot] Closed ${r.closed} stale LOCAL order(s) on boot`);
      });
    }
  } catch (e) {
    console.warn('[Cron] stale LOCAL cleanup skip:', e.message);
  }
  cron.schedule('*/2 * * * *', () => {
    syncOrdersStatus();
  });
};

module.exports = {
  initCron,
  syncOrdersStatus,
};
