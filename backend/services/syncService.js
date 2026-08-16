const Service = require('../models/Service');
const ApiProvider = require('../models/ApiProvider');
const Setting = require('../models/Setting');
const SmmProviderService = require('./smmProviderService');

const SMM_SHIBA_URL = 'https://smmshiba.com/api/v2';
const SMM_SHIBA_KEY = '8678863199f629b7d2564662ec9d8f03';

/**
 * Ensure SMMShiba provider exists in ApiProvider collection
 */
const getOrUpdateSmmShibaProvider = async () => {
  let provider = await ApiProvider.findOne({
    $or: [
      { name: /smmshiba/i },
      { apiUrl: SMM_SHIBA_URL },
    ],
  });

  if (!provider) {
    provider = await ApiProvider.create({
      name: 'SMMShiba',
      apiUrl: SMM_SHIBA_URL,
      apiKey: SMM_SHIBA_KEY,
      status: 'active',
    });
  } else {
    // Update API Key/URL if changed
    let modified = false;
    if (provider.apiUrl !== SMM_SHIBA_URL) {
      provider.apiUrl = SMM_SHIBA_URL;
      modified = true;
    }
    if (provider.apiKey !== SMM_SHIBA_KEY) {
      provider.apiKey = SMM_SHIBA_KEY;
      modified = true;
    }
    if (modified) {
      await provider.save();
    }
  }

  return provider;
};

/**
 * Synchronize SMMShiba services and calculate dynamic profit markups
 */
const syncSmmShibaServices = async () => {
  try {
    const provider = await getOrUpdateSmmShibaProvider();

    // 1. Fetch settings for global & category profit margins
    let settings = await Setting.findOne();
    if (!settings) {
      settings = await Setting.create({
        providerApiKey: SMM_SHIBA_KEY,
        providerApiUrl: SMM_SHIBA_URL,
        siteName: 'YouTube & Social SMM Panel',
        defaultProfitMargin: 20,
        categoryMargins: {},
      });
    }

    const defaultMargin = settings.defaultProfitMargin !== undefined ? settings.defaultProfitMargin : 20;
    const categoryMarginsMap = settings.categoryMargins || new Map();

    // Helper to get category margin percentage
    const getCategoryMargin = (catName) => {
      if (!catName) return defaultMargin;
      if (categoryMarginsMap instanceof Map) {
        if (categoryMarginsMap.has(catName)) return categoryMarginsMap.get(catName);
      } else if (typeof categoryMarginsMap === 'object' && categoryMarginsMap[catName] !== undefined) {
        return categoryMarginsMap[catName];
      }
      return defaultMargin;
    };

    // 2. Fetch catalog from SMMShiba API v2
    const fetchResult = await SmmProviderService.fetchServices(provider);
    if (!fetchResult.success || !Array.isArray(fetchResult.services)) {
      throw new Error(fetchResult.error || 'Failed to retrieve services catalog from SMMShiba API');
    }

    const externalServices = fetchResult.services;
    console.log(`[Sync SMMShiba] Retrived ${externalServices.length} services from provider.`);

    let addedCount = 0;
    let updatedCount = 0;

    // 3. Upsert each service into MongoDB
    for (const item of externalServices) {
      if (!item.service || !item.name) continue;

      const providerServiceId = String(item.service);
      const originalRate = Number(item.rate) || 0;
      const category = item.category || 'Other Services';
      const type = item.type || 'Default';
      const minQuantity = Number(item.min) || 1;
      const maxQuantity = Number(item.max) || 100000;
      const refill = Boolean(item.refill);

      // Existing service check
      const existing = await Service.findOne({ providerServiceId });

      let marginPercent = defaultMargin;
      if (existing && existing.marginPercent !== null && existing.marginPercent !== undefined) {
        marginPercent = existing.marginPercent;
      } else {
        marginPercent = getCategoryMargin(category);
      }

      // Profit markup formula: client_price = provider_rate + (provider_rate * profit_margin_percentage / 100)
      const clientPrice = originalRate + (originalRate * (marginPercent / 100));
      const ratePer1000 = Number(clientPrice.toFixed(4));

      const updateData = {
        name: item.name,
        category,
        type,
        originalRate,
        ratePer1000,
        marginPercent,
        minQuantity,
        maxQuantity,
        refill,
        providerId: provider._id,
        providerServiceId,
        status: existing ? existing.status : 'active',
      };

      if (!existing) {
        updateData.description = `${item.name} (${type} tier - SMMShiba ID ${providerServiceId})`;
        updateData.speed = 'Standard Delivery';
        await Service.create(updateData);
        addedCount++;
      } else {
        await Service.updateOne({ _id: existing._id }, { $set: updateData });
        updatedCount++;
      }
    }

    // Also update provider balance in background
    const balanceRes = await SmmProviderService.getProviderBalance(provider);
    if (balanceRes && balanceRes.balance !== undefined) {
      provider.balance = Number(balanceRes.balance) || 0;
      await provider.save();
    }

    console.log(`[Sync SMMShiba Complete] Processed ${externalServices.length} services (Added: ${addedCount}, Updated: ${updatedCount})`);

    return {
      success: true,
      totalFetched: externalServices.length,
      addedCount,
      updatedCount,
      providerBalance: provider.balance,
    };
  } catch (error) {
    console.error('[Sync SMMShiba Error]', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  getOrUpdateSmmShibaProvider,
  syncSmmShibaServices,
};
