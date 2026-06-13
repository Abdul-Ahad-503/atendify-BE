const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is not defined');
}

// cache connection across invocations
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }

  return cached.conn;
};

module.exports = connectDB;