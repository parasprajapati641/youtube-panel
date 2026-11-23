const Order = require('../models/Order');
const Service = require('../models/Service');
const User = require('../models/User');
const ApiProvider = require('../models/ApiProvider');
const SmmProviderService = require('../services/smmProviderService');
const localBotService = require('../services/localBotService');
const { syncOrdersStatus } = require('../services/cronService');

// Generic positive comments bank for auto-constructing comments payload for SMM Provider APIs

const GENERIC_POSITIVE_COMMENTS = [
  "Amazing gameplay! 🔥🎮",
  "🔥🔥🔥",
  "बहुत शानदार कहानी है! ❤️😍",
  "¡Qué increíble video! 🔥",
  "😍😍👏",
  "મજા આવી ગઈ ભાઈ! 😂❤️",
  "This is absolutely epic! 🤯🔥",
  "🎮💯👑",
  "¡Me encanta este video! 😍👏",
  "क्या जबरदस्त सीन था! 😱🔥",
  "😂🤣🔥",
  "Que história incrível! 🥹❤️",
  "最高すぎる！ 🔥👏",
  "❤️❤️❤️",
  "정말 대박이에요! 😍",
  "Вау, очень круто! 🔥❤️",
  "C'est magnifique ! 😍✨",
  "🥹❤️✨",
  "Bro that was insane! 💀🔥",
  "क्या बात है भाई! 💯👏",
  "🚀🔥💥",
  "¡Sigue así! 🚀❤️",
  "Muito top! 🔥🎮",
  "So emotional! 🥺❤️",
  "👏👏👏",
  "वाह! दिल खुश हो गया! 😍",
  "Ce moment est incroyable ! 🤯",
  "🎬🍿❤️",
  "最高のストーリー！ ❤️🎬",
  "هذا رائع جداً! 🔥😍",
  "Das ist einfach genial! 💯",
  "Какая классная история! ❤️",
  "⚡🔥💯",
  "આવી જ મસ્ત વિડિયો બનાવતા રહેજો! 🔥",
  "Unbelievable scenes! 😱🍿",
  "The ending was everything! 🥹👏",
  "😍🥰❤️",
  "Qué final tan épico! 🔥💯",
  "Muito emocionante! ❤️🥹",
  "本当に面白い動画！ 🎮🔥",
  "💀😂🔥",
  "영상 퀄리티 최고예요! 💯",
  "Bro cooked with this one! 🔥👑",
  "What a legendary moment! 🏆🎮",
  "दिल छू लिया इस कहानी ने! ❤️🥹",
  "🙌💯🔥",
  "This deserves more views! 🚀🔥",
  "Increíble trabajo! 👏😍",
  "Quelle belle histoire ! ❤️✨",
  "भाई, एकदम जबरदस्त! 🔥💯",
  "الله عليك! ❤️👏",
  "Simply awesome! 😎🔥",
  "🤯😱👏",
  "I'm speechless! 🤯❤️",
  "Крутое видео! 🔥🎬",
  "Wow, loved this! 🥰",
  "That was unexpected! 😳😂",
  "🌟👏❤️",
  "Best entertainment! 🍿🔥",
  "So cool bro! 😎🎮",
  "क्या सीन है! 😂🔥",
  "¡Qué pasada! 🤩",
  "Adorei demais! ❤️👏",
  "すごい！ 😍🔥",
  "🫶🥹❤️",
  "완전 최고! ❤️🔥",
  "👑🎮🔥",
  "Fantastic work! 💯🚀",
  "❤️🔥😍"
];



const generateAutoComments = (count, existingLines = []) => {
  // Random unique picks from full GENERIC_POSITIVE_COMMENTS bank (not always first N)
  const list = [...existingLines];
  const need = Math.max(0, count - list.length);
  if (need <= 0) return list.slice(0, count).join('\n');

  const bank = [...GENERIC_POSITIVE_COMMENTS];
  // Fisher–Yates shuffle
  for (let i = bank.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bank[i], bank[j]] = [bank[j], bank[i]];
  }

  let pool = [...bank];
  for (let n = 0; n < need; n++) {
    if (!pool.length) {
      pool = [...GENERIC_POSITIVE_COMMENTS];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    list.push(pool.pop());
  }
  return list.join('\n');
};

// Helper to validate target URL format
const isValidTargetUrl = (urlString) => {
  if (!urlString || typeof urlString !== 'string') return false;
  const trimmed = urlString.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
};

// Helper to convert raw provider API errors into friendly JSON user messages
const formatProviderError = (rawError) => {
  if (!rawError || typeof rawError !== 'string') {
    return 'Unable to process order with provider API. Please try another quality tier.';
  }
  const lower = rawError.toLowerCase();
  if (lower.includes('not enough balance') || lower.includes('low balance') || lower.includes('api balance')) {
    return 'This service package is undergoing temporary provider maintenance. Please try another tier.';
  }
  if (lower.includes('invalid link') || lower.includes('bad link') || lower.includes('link format')) {
    return 'The target link format was rejected by the SMM provider. Please verify your link.';
  }
  if (lower.includes('quantity') || lower.includes('min') || lower.includes('max')) {
    return 'The requested order quantity does not match the provider limits for this package.';
  }
  if (lower.includes('service disabled') || lower.includes('service inactive') || lower.includes('not found')) {
    return 'Selected service package is currently inactive. Please choose a different quality tier.';
  }
  return `Provider API Error: ${rawError}`;
};

// @route   POST /api/orders
// @desc    Place a new order & auto-dispatch to external SMM Provider API
const createOrder = async (req, res) => {
  try {
    const { serviceId, link, quantity, comments } = req.body;

    if (!serviceId || !link || quantity === undefined || quantity === null) {
      return res.status(400).json({ message: 'Service, Target Link, and Quantity are required' });
    }

    // 1. Target URL Format Validation
    if (!isValidTargetUrl(link)) {
      return res.status(400).json({ message: 'Please provide a valid target URL starting with http:// or https://' });
    }

    const numericQuantity = Number(quantity);
    if (isNaN(numericQuantity) || !Number.isInteger(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be a valid positive integer' });
    }

    const service = await Service.findById(serviceId).populate('providerId');
    if (!service || service.status !== 'active') {
      return res.status(404).json({ message: 'Selected service package is inactive or not found' });
    }

    // 2. Strict Quantity Limits Bounds Validation before provider API call
    if (numericQuantity < service.minQuantity || numericQuantity > service.maxQuantity) {
      return res.status(400).json({
        message: `Quantity must be between ${service.minQuantity.toLocaleString()} and ${service.maxQuantity.toLocaleString()} for this service`,
      });
    }

    const isCommentService = (service.category || '').toLowerCase().includes('comment') || (service.name || '').toLowerCase().includes('comment');
    // User-typed comments only (if any). Do NOT auto-fill bank yet – local bot uses AI smart comments.
    let commentsData = comments && typeof comments === 'string' ? comments.replace(/\r\n/g, '\n').trim() : '';
    const userProvidedComments = commentsData;

    // Detect local bot early (same rules as dispatch below)
    const providerEarly = service.providerId;
    const providerServiceIdEarly = service.providerServiceId || service._id.toString();
    const providerApiUrlEarly = (providerEarly && providerEarly.apiUrl) || process.env.SMM_PROVIDER_URL || '';
    const isLocalServiceEarly =
      String(providerServiceIdEarly).startsWith('local-') ||
      String(service.name || '').toLowerCase().includes('local') ||
      !providerApiUrlEarly ||
      !/^https?:\/\//i.test(providerApiUrlEarly);
    const useLocalBotEarly =
      process.env.USE_LOCAL_BOT === 'true' ||
      (process.env.USE_LOCAL_BOT !== 'false' && isLocalServiceEarly) ||
      (process.env.USE_LOCAL_BOT !== 'false' && !providerApiUrlEarly);

    // Auto-inject generic bank ONLY for external SMM providers (they need a comments payload).
    // Local Playwright bots → leave empty so smartComment.util generates video-based AI comments.
    if (isCommentService && !useLocalBotEarly) {
      const existingLines = commentsData ? commentsData.split('\n').map((l) => l.trim()).filter((l) => l.length > 0) : [];
      if (existingLines.length < numericQuantity) {
        commentsData = generateAutoComments(numericQuantity, existingLines);
        console.log(`[Order Controller] Zero-Friction: Injected ${numericQuantity} generic comments for external SMM provider.`);
      }
    } else if (isCommentService && useLocalBotEarly) {
      if (!userProvidedComments) {
        commentsData = '';
        console.log('[Order Controller] Local bot: skipping generic comment bank → smart AI comments from video');
      } else {
        console.log('[Order Controller] Local bot: using user-provided comments from request');
      }
    }

    // Calculate total cost
    const totalCost = Number(((numericQuantity / 1000) * service.ratePer1000).toFixed(4));

    // Get current user profile
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User account not found' });
    }

    // ----- role=admin limits (set by super_admin) -----
    if (user.role === 'admin') {
      const dayKey = new Date().toISOString().slice(0, 10);
      const monthKey = new Date().toISOString().slice(0, 7);

      if (user.dailyBotDateKey !== dayKey) {
        user.dailyLikeUsed = 0;
        user.dailyCommentUsed = 0;
        user.dailyBotUsed = 0;
        user.dailyBotDateKey = dayKey;
      }
      if (user.monthlyEarningMonthKey !== monthKey) {
        user.monthlyEarningUsedInr = 0;
        user.monthlyEarningMonthKey = monthKey;
      }

      const catCheck = `${service.category || ''} ${service.name || ''}`.toLowerCase();
      const isCommentOrder = catCheck.includes('comment');
      const isLikeOrder = catCheck.includes('like') || (catCheck.includes('youtube') && !isCommentOrder && !catCheck.includes('subscribe'));

      // dailyBotLimit applies SEPARATELY to likes and to comments (e.g. 100 → 100 likes + 100 comments)
      if (user.dailyBotLimit > 0) {
        if (isCommentOrder) {
          const used = user.dailyCommentUsed || 0;
          if (used + numericQuantity > user.dailyBotLimit) {
            return res.status(400).json({
              message: `Daily COMMENT limit exceeded. Used ${used}/${user.dailyBotLimit}. This order needs ${numericQuantity}.`,
            });
          }
        } else if (isLikeOrder) {
          const used = user.dailyLikeUsed || 0;
          if (used + numericQuantity > user.dailyBotLimit) {
            return res.status(400).json({
              message: `Daily LIKE limit exceeded. Used ${used}/${user.dailyBotLimit}. This order needs ${numericQuantity}.`,
            });
          }
        }
      }

      // Channel lock: first like/comment video locks admin to that channel
      const isLikeOrComment =
        (service.category || '').toLowerCase().includes('like') ||
        (service.category || '').toLowerCase().includes('comment') ||
        (service.name || '').toLowerCase().includes('like') ||
        (service.name || '').toLowerCase().includes('comment');

      if (isLikeOrComment) {
        let channel = null;
        try {
          const oembedUrl =
            'https://www.youtube.com/oembed?format=json&url=' +
            encodeURIComponent(link.trim());
          const resp = await fetch(oembedUrl);
          if (resp.ok) {
            const data = await resp.json();
            const authorUrl = data.author_url || '';
            const authorName = data.author_name || '';
            let chId = authorUrl;
            const m = String(authorUrl).match(/channel\/([^/?#]+)/);
            if (m) chId = m[1];
            else {
              const h = String(authorUrl).match(/@([^/?#]+)/);
              if (h) chId = '@' + h[1];
            }
            channel = {
              id: chId || authorUrl,
              title: authorName,
              url: authorUrl,
            };
          }
        } catch (e) {
          console.warn('[Order] Channel lookup failed:', e.message);
        }

        if (channel && channel.id) {
          if (!user.lockedChannelId) {
            user.lockedChannelId = channel.id;
            user.lockedChannelTitle = channel.title;
            user.lockedChannelUrl = channel.url;
            user.lockedAt = new Date();
            try {
              const Notification = require('../models/Notification');
              await Notification.create({
                type: 'info',
                title: 'Admin channel locked',
                message: `Admin "${user.username}" locked to channel "${channel.title}" (${channel.id}) after first order.`,
                userId: user._id,
                username: user.username,
                meta: { channel },
              });
            } catch (_) {}
          } else if (
            user.lockedChannelId &&
            String(user.lockedChannelId) !== String(channel.id) &&
            !String(channel.url || '').includes(String(user.lockedChannelId)) &&
            !String(user.lockedChannelUrl || '').includes(String(channel.id))
          ) {
            return res.status(403).json({
              message: `You can only order on your locked channel: ${user.lockedChannelTitle || user.lockedChannelId}. Contact Super Admin to change channel.`,
              lockedChannelId: user.lockedChannelId,
              lockedChannelTitle: user.lockedChannelTitle,
            });
          }
        }
      }

      // Track daily usage per action type
      const catInc = `${service.category || ''} ${service.name || ''}`.toLowerCase();
      if (catInc.includes('comment')) {
        user.dailyCommentUsed = (user.dailyCommentUsed || 0) + numericQuantity;
      } else if (catInc.includes('like') || (catInc.includes('youtube') && !catInc.includes('subscribe'))) {
        user.dailyLikeUsed = (user.dailyLikeUsed || 0) + numericQuantity;
      }
      user.dailyBotUsed =
        (user.dailyLikeUsed || 0) + (user.dailyCommentUsed || 0);
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

    // Dispatch: LOCAL Playwright bot (default) OR third-party SMM if USE_LOCAL_BOT=false
    const provider = service.providerId;
    const providerServiceId = service.providerServiceId || service._id.toString();

    console.log(`[Order Controller] Dispatching order for user "${user.username}" (isUnlimited: ${user.isUnlimited})...`);

    const providerApiUrl = (provider && provider.apiUrl) || process.env.SMM_PROVIDER_URL || '';
    const isLocalService =
      String(providerServiceId).startsWith('local-') ||
      String(service.name || '').toLowerCase().includes('local') ||
      !providerApiUrl ||
      !/^https?:\/\//i.test(providerApiUrl);

    // Prefer local bot unless explicitly disabled AND a valid external provider URL exists
    const useLocalBot =
      process.env.USE_LOCAL_BOT === 'true' ||
      (process.env.USE_LOCAL_BOT !== 'false' && isLocalService) ||
      (process.env.USE_LOCAL_BOT !== 'false' && !providerApiUrl);

    let providerResult;
    if (useLocalBot) {
      console.log('[Order] Using LOCAL Playwright bot');
      providerResult = await localBotService.addOrder(service, link.trim(), numericQuantity, commentsData);
    } else {
      console.log('[Order] Using third-party SMM provider →', providerApiUrl);
      if (!providerApiUrl || !/^https?:\/\//i.test(providerApiUrl)) {
        console.warn('[Order] Provider API URL missing/invalid – falling back to LOCAL bot');
        providerResult = await localBotService.addOrder(service, link.trim(), numericQuantity, commentsData);
      } else {
        providerResult = await SmmProviderService.addOrder(
          provider,
          providerServiceId,
          link.trim(),
          numericQuantity,
          commentsData
        );
      }
    }

    let providerOrderId = '';
    let apiErrorDetails = '';
    let initialStatus = 'Pending';

    if (providerResult.success) {
      providerOrderId = providerResult.providerOrderId;
      // Local bot: stay In Progress until Playwright job finishes
      if (String(providerOrderId).startsWith('LOCAL-')) {
        initialStatus = 'In Progress';
      }
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
      comments: commentsData,
      totalCost,
      providerOrderId,
      apiErrorDetails,
      remains: numericQuantity,
      status: initialStatus,
    });

    // Bind Mongo order id so LocalBot can mark Completed when job ends
    if (providerResult.success && String(providerOrderId).startsWith('LOCAL-')) {
      try {
        localBotService.bindOrderId(providerOrderId, newOrder._id);
      } catch (e) {
        console.warn('[Order] bindOrderId failed:', e.message);
      }
    }

    const populatedOrder = await Order.findById(newOrder._id).populate('serviceId', 'name category ratePer1000 speed');

    if (!providerResult.success) {
      const friendlyMessage = formatProviderError(apiErrorDetails);
      return res.status(400).json({
        message: friendlyMessage,
        order: populatedOrder,
        apiErrorDetails,
        newBalance: user.balance,
      });
    }

    return res.status(201).json({
      message: 'Order placed and dispatched to local YouTube bot successfully!',
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

/**
 * Resume Partial / Canceled LOCAL order – runs remaining quantity only.
 * POST /api/orders/:id/resume
 */
const resumeOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('serviceId');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (String(order.userId) !== String(req.user._id) && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Not allowed to resume this order' });
    }

    const remains = Number(order.remains);
    if (!remains || remains < 1) {
      return res.status(400).json({ message: 'Nothing left to resume (remains = 0)' });
    }

    const st = String(order.status || '');
    if (!['Partial', 'Canceled', 'Cancelled', 'In Progress'].includes(st)) {
      return res.status(400).json({
        message: `Cannot resume status "${st}". Only Partial / Canceled / In Progress.`,
      });
    }

    const isLocal = String(order.providerOrderId || '').startsWith('LOCAL-');
    if (!isLocal) {
      return res.status(400).json({ message: 'Resume only works for local bot orders' });
    }

    try {
      if (
        localBotService.jobStatus &&
        localBotService.jobStatus.get(order.providerOrderId) === 'In Progress'
      ) {
        return res.status(400).json({ message: 'Order job is already running' });
      }
    } catch (_) {}

    const service = order.serviceId;
    if (!service) {
      return res.status(400).json({ message: 'Service missing on order' });
    }

    order.status = 'In Progress';
    await order.save();

    const result = await localBotService.addOrder(
      service,
      order.link,
      remains,
      order.comments || '',
      order._id
    );

    if (result && result.providerOrderId) {
      order.providerOrderId = result.providerOrderId;
      await order.save();
      try {
        localBotService.bindOrderId(result.providerOrderId, order._id);
      } catch (_) {}
    }

    console.log(
      `[Order] Resume #${String(order._id).slice(-6)} remains=${remains} → job ${result.providerOrderId}`
    );

    return res.json({
      success: true,
      message: `Resumed ${remains} remaining unit(s)`,
      orderId: order._id,
      providerOrderId: result.providerOrderId,
      remains,
    });
  } catch (error) {
    console.error('[Resume Order]', error);
    return res.status(500).json({ message: error.message || 'Resume failed' });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getUserDashboardStats,
  resumeOrder,
};
