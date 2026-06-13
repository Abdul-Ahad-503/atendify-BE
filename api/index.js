require('dotenv').config();
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/database');

let isConnected = false;

module.exports = async (req, res) => {
  try {
    if (!isConnected) {
      await connectDB();
      isConnected = true;
    }
    return app(req, res);
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server connection failed'
    });
  }
};