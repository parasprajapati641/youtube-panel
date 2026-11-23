const ApiProvider = require('../models/ApiProvider');
const SmmProviderService = require('../services/smmProviderService');

// @route   GET /api/admin/providers
const getProviders = async (req, res) => {
  try {
    const providers = await ApiProvider.find().sort({ createdAt: -1 });
    return res.json(providers);
  } catch (error) {
    console.error('[Get Providers Error]', error);
    return res.status(500).json({ message: 'Error fetching providers' });
  }
};

// @route   POST /api/admin/providers
const createProvider = async (req, res) => {
  try {
    const { name, apiUrl, apiKey, status } = req.body;

    if (!name || !apiUrl || !apiKey) {
      return res.status(400).json({ message: 'Name, API URL, and API Key are required' });
    }

    const provider = await ApiProvider.create({
      name,
      apiUrl: apiUrl.trim(),
      apiKey: apiKey.trim(),
      status: status || 'active',
    });

    return res.status(201).json({ message: 'API Provider added successfully', provider });
  } catch (error) {
    console.error('[Create Provider Error]', error);
    return res.status(500).json({ message: 'Error creating provider' });
  }
};

// @route   PUT /api/admin/providers/:id
const updateProvider = async (req, res) => {
  try {
    const provider = await ApiProvider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const { name, apiUrl, apiKey, status } = req.body;
    if (name !== undefined) provider.name = name;
    if (apiUrl !== undefined) provider.apiUrl = apiUrl.trim();
    if (apiKey !== undefined) provider.apiKey = apiKey.trim();
    if (status !== undefined) provider.status = status;

    await provider.save();
    return res.json({ message: 'Provider updated successfully', provider });
  } catch (error) {
    console.error('[Update Provider Error]', error);
    return res.status(500).json({ message: 'Error updating provider' });
  }
};

// @route   DELETE /api/admin/providers/:id
const deleteProvider = async (req, res) => {
  try {
    const provider = await ApiProvider.findByIdAndDelete(req.params.id);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }
    return res.json({ message: 'Provider deleted successfully' });
  } catch (error) {
    console.error('[Delete Provider Error]', error);
    return res.status(500).json({ message: 'Error deleting provider' });
  }
};

// @route   POST /api/admin/providers/:id/balance
const checkBalance = async (req, res) => {
  try {
    const provider = await ApiProvider.findById(req.params.id);
    if (!provider) {
      return res.status(404).json({ message: 'Provider not found' });
    }

    const result = await SmmProviderService.getProviderBalance(provider);
    if (result.balance !== undefined) {
      provider.balance = Number(result.balance) || 0;
      await provider.save();
    }

    return res.json({ message: 'Balance updated', balance: provider.balance, result });
  } catch (error) {
    console.error('[Check Balance Error]', error);
    return res.status(500).json({ message: 'Error checking balance' });
  }
};

module.exports = {
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  checkBalance,
};
