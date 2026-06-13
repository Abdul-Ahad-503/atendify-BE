const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { updatePushToken } = require('../controllers/userController');

router.post('/push-token', protect, updatePushToken);

module.exports = router;