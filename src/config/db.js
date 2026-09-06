const mongoose = require('mongoose');
const env = require('./env');

// Disable query buffering so operations fail immediately rather than hanging for 10s if disconnected
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);

mongoose.connection.on('connected', () => {
  console.log(`✓ MongoDB Connected: ${mongoose.connection.host}:${mongoose.connection.port || ''}/${mongoose.connection.name}`);
});

mongoose.connection.on('error', (err) => {
  console.error('✗ MongoDB Runtime Error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('! MongoDB Disconnected');
});

async function connectDb() {
  try {
    console.log(`Connecting to MongoDB at: ${env.mongoUri ? env.mongoUri.replace(/:([^@]+)@/, ':****@') : 'undefined'}...`);
    await mongoose.connect(env.mongoUri, {
      autoIndex: env.env !== 'production',
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000
    });
    return true;
  } catch (error) {
    console.error('✗ MongoDB Connection Failed:', error.message);
    console.warn('! Continuing in degraded offline mode (database features will be disabled).');
    return false;
  }
}

module.exports = { connectDb };

