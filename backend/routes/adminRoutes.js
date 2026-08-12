const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/adminController');
const {
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  checkBalance,
} = require('../controllers/providerController');

const { protect, adminOnly } = require('../middleware/auth');

// Require authentication & admin role for all routes in this router
router.use(protect, adminOnly);

router.get('/stats', getAdminStats);

// User Management
router.get('/users', getAllUsers);
router.put('/users/:id', updateUser);

// Service Management
router.get('/services', getAdminServices);
router.post('/services', createService);
router.put('/services/:id', updateService);
router.delete('/services/:id', deleteService);

// Order Management
router.get('/orders', getAllOrders);
router.put('/orders/:id/status', updateOrderStatus);
router.post('/orders/sync', forceSyncOrders);

// Provider Management
router.get('/providers', getProviders);
router.post('/providers', createProvider);
router.put('/providers/:id', updateProvider);
router.delete('/providers/:id', deleteProvider);
router.post('/providers/:id/balance', checkBalance);

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
