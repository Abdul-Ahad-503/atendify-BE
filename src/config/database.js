require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    console.log('🔍 MONGODB_URI exists:', !!process.env.MONGODB_URI);
    console.log('🔍 MONGODB_URI length:', process.env.MONGODB_URI?.length);
    console.log('🔍 Attempting connection to MongoDB...');
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4 (Windows DNS resolution fix)
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed due to app termination');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('❌ Error name:', error.name);
    console.error('❌ Full error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
