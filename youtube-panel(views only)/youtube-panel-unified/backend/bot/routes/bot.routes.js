const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bot.controller');

// Manual: { botName } → blank browser, user closes to save cookies
// Auto:   { botName, email, password }
router.post('/register', ctrl.registerBot);

// CSV bulk: { csv: "email,password\\n..." } or email,password,botName
router.post('/register-csv', ctrl.registerBotsCsv);

router.post('/refresh/:botName', ctrl.refreshBot);

router.post('/like', ctrl.likeVideo);
router.post('/comment', ctrl.commentVideo);
router.post('/subscribe', ctrl.subscribeChannel);

router.get('/list', ctrl.listBots);
router.get('/:botName', ctrl.getBot);
router.delete('/:botName', ctrl.deleteBot);

module.exports = router;
