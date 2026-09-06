const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const env = require('../config/env');
const { ADMIN_COOKIE, verifyAdminSession } = require('../services/adminService');

module.exports = async function adminAuth(req, res, next) {
  const cookie = req.signedCookies[ADMIN_COOKIE] || req.cookies[ADMIN_COOKIE];
  if (!cookie) {
    return res.status(401).redirect(env.adminAccessPath);
  }

  const session = verifyAdminSession(cookie);
  if (!session) {
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    return res.status(401).redirect(env.adminAccessPath);
  }

  if (mongoose.connection.readyState !== 1) {
    // If DB is offline but user has a valid cryptographic session cookie, fallback gracefully
    req.admin = {
      email: session.email,
      role: session.role || 'superadmin',
      isOfflineMode: true
    };
    return next();
  }

  try {
    const admin = await Admin.findOne({ email: session.email }).lean();
    if (!admin) {
      res.clearCookie(ADMIN_COOKIE, { path: '/' });
      return res.status(401).redirect(env.adminAccessPath);
    }

    req.admin = admin;
    return next();
  } catch (error) {
    console.error('Database error in adminAuth:', error.message);
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    return res.status(401).redirect(env.adminAccessPath);
  }
};

