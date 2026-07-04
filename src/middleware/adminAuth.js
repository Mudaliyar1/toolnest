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

  const admin = await Admin.findOne({ email: session.email }).lean();
  if (!admin) {
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    return res.status(401).redirect(env.adminAccessPath);
  }

  req.admin = admin;
  return next();
};
