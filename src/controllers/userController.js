const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/responseUtils');

const updatePushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;

    if (!pushToken) {
      return sendError(res, 400, 'pushToken is required');
    }

    await User.findByIdAndUpdate(req.user._id, { pushToken });

    return sendSuccess(res, 200, 'Push token saved');
  } catch (error) {
    return sendError(res, 500, 'Failed to save push token', [error.message]);
  }
};

module.exports = { updatePushToken };