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
  if (
    cat.includes('watch hour') ||
    cat.includes('watch-hour') ||
    cat.includes('watchhour') ||
    (cat.includes('hour') && cat.includes('watch')) ||
    cat.includes('local-watch-hour')
  ) {
    return 'watch_hours';
  }
  // Views: no login, anonymous multi-browser watch
  if (cat.includes('view') || (cat.includes('watch') && !cat.includes('hour'))) return 'view';
  if (cat.includes('like')) return 'like';
  if (cat.includes('youtube')) return 'like';
  return 'like';
}

function toBotCount(quantity) {
  const q = parseInt(quantity, 10) || 1;
  return Math.min(50, Math.max(1, q));
}

async function markOrderDone(jobId, orderId, ok, errorMsg) {
  const status = ok ? 'Completed' : 'Canceled';
  jobStatus.set(jobId, status);
  const boundId =
    orderId ||
    (bindOrderId._map && bindOrderId._map.get(jobId)) ||
    null;
  try {
    const q = boundId
      ? { _id: boundId }
      : { providerOrderId: jobId };
    const update = {
      status,
      remains: ok ? 0 : undefined,
      ...(errorMsg ? { apiErrorDetails: String(errorMsg).slice(0, 500) } : {}),
    };
    if (update.remains === undefined) delete update.remains;
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

  const run = async () => {
    try {
      if (action === 'subscribe') {
        await botService.processSubscribe(link, { botCount });
      } else if (action === 'comment') {
        const comments = commentsData
          ? String(commentsData)
              .split(/\n/)
              .map((c) => c.trim())
              .filter(Boolean)
          : undefined;
        await botService.processActions(link, {
          botCount,
          doLike: false,
          doComment: true,
          comments,
        });
      } else if (action === 'view') {
        // Anonymous views – no login, multi-browser
        await botService.processViews(link, { botCount });
      } else if (action === 'watch_hours') {
        await botService.processWatchHours(link, { botCount });
      } else {
        await botService.processActions(link, {
          botCount,
          doLike: true,
          doComment: false,
        });
      }
      console.log(`[LocalBot] Job ${jobId} finished OK`);
      await markOrderDone(jobId, orderId, true, null);
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
      out[id] = { status: mem, charge: '0' };
      continue;
    }
    // DB fallback
    try {
      const ord = await Order.findOne({ providerOrderId: id }).select('status');
      if (ord) {
        out[id] = { status: ord.status || 'In Progress', charge: '0' };
      } else {
        // Unknown old job – don't force Completed
        out[id] = { status: 'In Progress', charge: '0' };
      }
    } catch (_) {
      out[id] = { status: 'In Progress', charge: '0' };
    }
  }
  return out;
}

module.exports = {
  addOrder,
  startJob,
  bindOrderId,
  getOrderStatus,
  detectAction,
  jobStatus,
};
