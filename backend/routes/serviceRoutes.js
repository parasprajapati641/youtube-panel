const express = require('express');
const router = express.Router();
const { getActiveServices } = require('../controllers/serviceController');

router.get('/', getActiveServices);

module.exports = router;
