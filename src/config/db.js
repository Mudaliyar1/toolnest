const mongoose = require('mongoose');
const env = require('./env');

async function connectDb() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongoUri, {
      autoIndex: env.env !== 'production',
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000
    });
    return true;
  } catch (error) {
    console.warn('MongoDB connection unavailable, continuing in degraded mode.');
    return false;
  }
}

module.exports = { connectDb };
