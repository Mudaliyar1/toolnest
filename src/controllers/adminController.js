const Workspace = require('../models/Workspace');
const File = require('../models/File');
const ToolUsage = require('../models/ToolUsage');
const Visitor = require('../models/Visitor');
const Analytics = require('../models/Analytics');
const Admin = require('../models/Admin');
const { authenticateAdmin, setAdminCookie, ensureDefaultAdmin, ADMIN_COOKIE } = require('../services/adminService');
const env = require('../config/env');

async function renderLogin(req, res) {
  await ensureDefaultAdmin();

  res.render('admin/login', {
    title: 'Secure Admin Access',
    error: null
  });
}

async function handleLogin(req, res) {
  const password = String(req.body.password || '').trim();
  if (!password) {
    return res.status(400).render('admin/login', {
      title: 'Secure Admin Access',
      error: 'Password is required.'
    });
  }

  const admin = await authenticateAdmin(password);
  if (!admin) {
    return res.status(401).render('admin/login', {
      title: 'Secure Admin Access',
      error: 'Access denied.'
    });
  }

  await Admin.updateOne({ email: admin.email }, { $set: { lastLoginAt: new Date() } });
  setAdminCookie(res, admin);
  return res.redirect('/secure-admin-access/dashboard');
}

async function renderDashboard(req, res) {
  const analytics = await Analytics.findOne().lean();
  const [totalVisitors, activeUsers, todayVisitors, monthlyVisitors, totalToolUsage, serverHealth] = await Promise.all([
    Visitor.countDocuments(),
    Workspace.countDocuments({ expiresAt: { $gt: new Date() } }),
    Visitor.countDocuments({ visitTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    Visitor.countDocuments({ visitTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    ToolUsage.aggregate([{ $group: { _id: null, total: { $sum: '$totalUsage' } } }]),
    Promise.resolve({ status: 'healthy', uptime: process.uptime() })
  ]);

  const mostUsedTools = await ToolUsage.find().sort({ totalUsage: -1 }).limit(5).lean();
  const activeFiles = await File.countDocuments({ expireTime: { $gt: new Date() } });
  const expiredFiles = await File.countDocuments({ expireTime: { $lte: new Date() } });

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    admin: req.admin,
    metrics: {
      totalVisitors,
      totalSessions: analytics ? analytics.sessions : 0,
      activeUsers,
      todayVisitors,
      monthlyVisitors,
      totalToolUsage: totalToolUsage[0] ? totalToolUsage[0].total : 0,
      serverHealth,
      activeFiles,
      expiredFiles
    },
    mostUsedTools,
    csrfToken: req.csrfToken()
  });
}

async function handleLogout(req, res) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.redirect(env.adminAccessPath);
}

module.exports = {
  handleLogin,
  handleLogout,
  renderDashboard,
  renderLogin
};
