const express = require('express');
const router = express.Router();
const {
  createOrder,
  getMyOrders,
  getUserDashboardStats,
  resumeOrder,
} = require('../controllers/orderController');
const { protect } = require('../middleware/auth');

router.post('/', protect, createOrder);
router.get('/my-orders', protect, getMyOrders);
router.get('/stats', protect, getUserDashboardStats);
router.post('/:id/resume', protect, resumeOrder);

module.exports = router;
