const express = require('express');
const router = express.Router();
const { addFundsMock } = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.post('/add-funds-mock', protect, addFundsMock);

module.exports = router;
