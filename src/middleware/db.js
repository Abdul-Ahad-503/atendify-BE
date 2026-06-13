const connectDB = require('../config/database');

const dbMiddleware = async (req, res, next) => {
  await connectDB();
  next();
};

module.exports = dbMiddleware;