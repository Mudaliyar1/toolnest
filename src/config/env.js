const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number.parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/raisetool',
  sessionSecret: process.env.SESSION_SECRET || 'raisetool-session-secret',
  cookieSecret: process.env.COOKIE_SECRET || 'raisetool-cookie-secret',
  cookieEncryptionKey: process.env.COOKIE_ENCRYPTION_KEY || 'raisetool-cookie-encryption-key-32',
  workspaceTtlMinutes: Number.parseInt(process.env.WORKSPACE_TTL_MINUTES || '10', 10),
  adminAccessPath: process.env.ADMIN_ACCESS_PATH || '/secure-admin-access',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@raisetool.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-me',
  siteName: process.env.SITE_NAME || 'RaiseTool',
  siteUrl: process.env.SITE_URL || 'http://localhost:3000',
  defaultToolCategory: process.env.DEFAULT_TOOL_CATEGORY || 'pdf',
  rootDir: path.resolve(__dirname, '..', '..'),
  uploadsDir: path.resolve(__dirname, '..', '..', 'storage', 'uploads'),
  processedDir: path.resolve(__dirname, '..', '..', 'storage', 'processed'),
  tempDir: path.resolve(__dirname, '..', '..', 'storage', 'tmp'),
  publicDir: path.resolve(__dirname, '..', '..', 'public')
};
