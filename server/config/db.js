const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const options = {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000,
    };
    
    await mongoose.connect(process.env.MONGODB_URI, options);
    console.log('✅ MongoDB Connected successfully');
    console.log(`Database: ${mongoose.connection.name}`);
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    // Don't exit in production - let the app run without DB if needed
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    } else {
      console.warn('⚠️  Server will continue without MongoDB connection');
    }
  }
};

module.exports = connectDB;
