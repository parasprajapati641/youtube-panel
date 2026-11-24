/**
 * Local YouTube Bot – same process as panel
 * Jobs stay In Progress until Playwright work finishes, then Order → Completed
 */
const botService = require('../bot/services/bot.service');
const Order = require('../models/Order');

/** In-memory job status (fallback if DB update races) */
const jobStatus = new Map(); // jobId -> 'In Progress' | 'Completed' | 'Canceled'

function detectAction(service) {
  const cat = `${service.category || ''} ${service.name || ''} ${service.providerServiceId || ''}`.toLowerCase();
  if (cat.includes('comment')) return 'comment';
  if (cat.includes('subscribe') || cat.includes('sub ')) return 'subscribe';
  // Watch hours before generic "view" / "watch"
  if (
    cat.includes('watch hour') ||
    cat.includes('watch-hour') ||
    cat.includes('watchhour') ||
    cat.includes('hour') && cat.includes('watch') ||
    cat.includes('local-watch-hour')
  ) {
    return 'watch_hours';
  }
  if (cat.includes('view') || (cat.includes('watch') && !cat.includes('hour'))) return 'view';
  if (cat.includes('like')) return 'like';
  if (cat.includes('youtube')) return 'like';
  return 'like';
}

/**
 * Use ordered quantity as-is.
 * Min/max limit = only Service.minQuantity / maxQuantity in DATABASE
 * (checked in orderController). No code / .env cap here.
 */
function toBotCount(quantity) {
  const q = parseInt(quantity, 10) || 1;
  return Math.max(1, q);
}

function resolveOrderQuery(jobId, orderId) {
  const boundId =
    orderId ||
    (bindOrderId._map && bindOrderId._map.get(jobId)) ||
    null;
  return boundId ? { _id: boundId } : { providerOrderId: jobId };
}

/**
 * Live progress: each finished bot/session updates Start Count + Remains.
 * startCount = delivered so far
 * remains   = quantity still left
 */
async function bumpOrderProgress(jobId, orderId, success, totalQuantity) {
  const q = resolveOrderQuery(jobId, orderId);
  try {
    const ord = await Order.findOne(q).select('quantity remains startCount status');
    if (!ord) return;

    const total = totalQuantity || ord.quantity || 0;
    let startCount = Number(ord.startCount) || 0;
    let remains =
      ord.remains !== undefined && ord.remains !== null
        ? Number(ord.remains)
        : total;

    if (success) {
      startCount += 1;
      remains = Math.max(0, remains - 1);
    }
    // failed unit: still consume one "slot" from remains so order does not hang forever
    else {
      remains = Math.max(0, remains - 1);
    }

    const update = {
      startCount,
      remains,
      status: remains <= 0 ? (startCount > 0 ? 'Completed' : 'Canceled') : 'In Progress',
    };

    await Order.findOneAndUpdate(q, update);
    console.log(
      `[LocalBot] Progress job=${jobId} | startCount=${startCount} remains=${remains} status=${update.status}`
    );

    if (update.status === 'Completed' || update.status === 'Canceled') {
      jobStatus.set(jobId, update.status);
    }
  } catch (e) {
    console.error(`[LocalBot] Progress update failed:`, e.message);
  }
}

async function markOrderDone(jobId, orderId, ok, errorMsg) {
  const status = ok ? 'Completed' : 'Canceled';
  jobStatus.set(jobId, status);
  const q = resolveOrderQuery(jobId, orderId);
  try {
    const update = {
      status,
      ...(ok ? { remains: 0 } : {}),
      ...(errorMsg ? { apiErrorDetails: String(errorMsg).slice(0, 500) } : {}),
    };
    await Order.findOneAndUpdate(q, update);
    console.log(`[LocalBot] Order ${jobId} → ${status}`);
  } catch (e) {
    console.error(`[LocalBot] Failed to update order status:`, e.message);
  }
}

/**
 * Start in-process Playwright job (async).
 * Returns immediately with jobId – order should be saved as In Progress.
 * Optional orderId: when set, DB status updated on finish.
 */
async function addOrder(service, link, quantity, commentsData, orderId = null) {
  const action = detectAction(service);
  const botCount = toBotCount(quantity);
  const jobId = `LOCAL-${action}-${Date.now()}`;
  jobStatus.set(jobId, 'In Progress');

  console.log(`[LocalBot] In-process ${action} | bots=${botCount} | ${link} | job=${jobId}`);

  const onProgress = async (result) => {
    const success = !!(result && result.success);
    await bumpOrderProgress(jobId, orderId, success, botCount);
  };

  const run = async () => {
    try {
      let results = [];
      if (action === 'subscribe') {
        results = await botService.processSubscribe(link, { botCount, onProgress });
      } else if (action === 'comment') {
        const parsed = commentsData
          ? String(commentsData)
              .split(/\n/)
              .map((c) => c.trim())
              .filter(Boolean)
          : [];
        const comments = parsed.length ? parsed : undefined;
        if (!comments) {
          console.log('[LocalBot] No comment list from order → smart AI comments will be used');
        } else {
          console.log(`[LocalBot] Using ${comments.length} comments from order`);
        }
        results = await botService.processActions(link, {
          botCount,
          doLike: false,
          doComment: true,
          comments,
          onProgress,
        });
      } else if (action === 'view') {
        results = await botService.processViews(link, { botCount, onProgress });
      } else if (action === 'watch_hours') {
        results = await botService.processWatchHours(link, { botCount, onProgress });
      } else {
        results = await botService.processActions(link, {
          botCount,
          doLike: true,
          doComment: false,
          onProgress,
        });
      }

      const list = Array.isArray(results) ? results : [];
      const okCount = list.filter((r) => r && r.success).length;
      const failCount = list.length - okCount;
      console.log(
        `[LocalBot] Job ${jobId} done | success=${okCount} fail=${failCount} total=${list.length}`
      );

      // Final status (progress already updated remains/startCount per bot)
      if (list.length > 0 && okCount === 0) {
        const errMsg = list.map((r) => r.error).filter(Boolean).join('; ') || 'All bots failed';
        await markOrderDone(jobId, orderId, false, errMsg);
      } else {
        await markOrderDone(jobId, orderId, true, null);
      }
    } catch (e) {
      console.error(`[LocalBot] Job ${jobId} failed:`, e.message);
      await markOrderDone(jobId, orderId, false, e.message);
    }
  };
  run();

  return {
    success: true,
    providerOrderId: jobId,
    action,
    botCount,
    rawResponse: { message: `${action} started for ${botCount} bot(s) – status In Progress` },
  };
}

/**
 * Attach Mongo order id to a running job (call right after Order.create).
 */
function bindOrderId(jobId, orderId) {
  if (!jobId || !orderId) return;
  // If job already finished, update order now
  const st = jobStatus.get(jobId);
  if (st === 'Completed' || st === 'Canceled') {
    markOrderDone(jobId, orderId, st === 'Completed', null);
    return;
  }
  // Monkey-patch: store orderId on next finish via wrapping map
  const prev = jobStatus.get(jobId) || 'In Progress';
  jobStatus.set(jobId, prev);
  // Re-bind by storing side map
  if (!bindOrderId._map) bindOrderId._map = new Map();
  bindOrderId._map.set(jobId, String(orderId));
}

// Enhance markOrderDone to use bind map
const _mark = markOrderDone;
async function markOrderDoneBound(jobId, orderId, ok, errorMsg) {
  const bound =
    orderId ||
    (bindOrderId._map && bindOrderId._map.get(jobId)) ||
    null;
  return _mark(jobId, bound, ok, errorMsg);
}

// Replace run path to use bound marker – simpler: export start after order create

/**
 * Preferred: create order first, then start job with orderId.
 */
function startJob(orderId, service, link, quantity, commentsData) {
  return addOrder(service, link, quantity, commentsData, orderId);
}

async function getOrderStatus(_provider, providerOrderIds) {
  const out = {};
  for (const id of providerOrderIds || []) {
    if (!id || !String(id).startsWith('LOCAL-')) continue;
    const mem = jobStatus.get(id);
    if (mem) {
      out[id] = { status: mem, charge: '0', live: true };
      continue;
    }
    // Not in memory → this Node process is not running that job
    // (PM2 restart / crash). Stale LOCAL orders must not stay "In Progress" forever.
    try {
      const ord = await Order.findOne({ providerOrderId: id }).select(
        'status remains startCount quantity createdAt'
      );
      if (!ord) {
        out[id] = { status: 'Canceled', charge: '0', stale: true };
        continue;
      }
      if (ord.status === 'Completed' || ord.status === 'Canceled' || ord.status === 'Cancelled') {
        out[id] = { status: ord.status, charge: '0' };
        continue;
      }
      const startCount = Number(ord.startCount) || 0;
      const remains = ord.remains != null ? Number(ord.remains) : Number(ord.quantity) || 0;
      // Job process gone: finalize from progress already saved
      if (remains <= 0 || startCount >= (Number(ord.quantity) || 0)) {
        out[id] = { status: 'Completed', charge: '0', stale: true };
      } else if (startCount > 0) {
        out[id] = { status: 'Partial', charge: '0', stale: true, startCount, remains };
      } else {
        // Never started / zero progress after process death
        out[id] = { status: 'Canceled', charge: '0', stale: true };
      }
    } catch (_) {
      out[id] = { status: 'Canceled', charge: '0', stale: true };
    }
  }
  return out;
}

/**
 * One-shot: close LOCAL orders that are In Progress but job is not in this process memory.
 * Call on server boot so old stuck orders clear after PM2 restart.
 */
async function finalizeStaleLocalOrders() {
  try {
    const active = await Order.find({
      status: { $in: ['Pending', 'In Progress', 'Processing'] },
      providerOrderId: { $regex: /^LOCAL-/ },
    }).select('_id providerOrderId status remains startCount quantity');

    if (!active.length) return { closed: 0 };

    let closed = 0;
    for (const ord of active) {
      const id = ord.providerOrderId;
      if (jobStatus.has(id)) continue; // still running in this process

      const startCount = Number(ord.startCount) || 0;
      const qty = Number(ord.quantity) || 0;
      const remains = ord.remains != null ? Number(ord.remains) : qty;

      let status;
      if (remains <= 0 || (qty > 0 && startCount >= qty)) status = 'Completed';
      else if (startCount > 0) status = 'Partial';
      else status = 'Canceled';

      await Order.updateOne(
        { _id: ord._id },
        {
          status,
          remains: status === 'Completed' ? 0 : remains,
          apiErrorDetails:
            status === 'Canceled'
              ? 'Local bot process restarted – job was not running'
              : ord.apiErrorDetails || '',
        }
      );
      closed++;
      console.log(
        `[LocalBot] Stale order ${String(ord._id).slice(-6)} → ${status} (start=${startCount} remains=${remains})`
      );
    }
    return { closed };
  } catch (e) {
    console.error('[LocalBot] finalizeStaleLocalOrders:', e.message);
    return { closed: 0, error: e.message };
  }
}

module.exports = {
  addOrder,
  startJob,
  bindOrderId,
  getOrderStatus,
  detectAction,
  jobStatus,
  finalizeStaleLocalOrders,
};
