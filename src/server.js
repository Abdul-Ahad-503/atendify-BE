require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/database');
const User = require('./models/User');

const PORT = process.env.PORT || 5000;

// Create default admin user if not exists
const createDefaultAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    
    if (!adminExists) {
      const admin = await User.create({
        name: 'System Admin',
        email: process.env.ADMIN_EMAIL || 'admin@atendify.com',
        password: process.env.ADMIN_PASSWORD || 'Admin@12345',
        role: 'admin',
        isActive: true
      });
      
      console.log('✅ Default admin user created');
      console.log(`📧 Email: ${admin.email}`);
      console.log('⚠️  Please change the default password immediately!');
    } else {
      console.log('ℹ️  Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Error creating default admin:', error.message);
  }
};

// Initialize server
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();
    
    // Create default admin after DB connection is established
    await createDefaultAdmin();
    
    // Start session timeout checker
    const { startSessionTimeoutChecker } = require('./scripts/sessionTimeout');
    startSessionTimeoutChecker();
    
    // Start server
    const server = app.listen(PORT, () => {
      console.log('='.repeat(50));
      console.log(`🚀 Atendify Backend Server`);
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📅 Started at: ${new Date().toLocaleString()}`);
      console.log('='.repeat(50));
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error('❌ Unhandled Rejection:', err.message);
      // Close server & exit process
      server.close(() => {
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught Exception:', err.message);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('👋 SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Process terminated');
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer();
