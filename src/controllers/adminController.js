const Workspace = require('../models/Workspace');
const File = require('../models/File');
const ToolUsage = require('../models/ToolUsage');
const Visitor = require('../models/Visitor');
const Analytics = require('../models/Analytics');
const Admin = require('../models/Admin');
const { authenticateAdmin, setAdminCookie, ensureDefaultAdmin, ADMIN_COOKIE } = require('../services/adminService');
const env = require('../config/env');
const fs = require('fs/promises');

async function renderLogin(req, res) {
  await ensureDefaultAdmin();

  res.render('admin/login', {
    title: 'Secure Admin Access',
    error: null
  });
}

async function handleLogin(req, res) {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '').trim();
  if (!email || !password) {
    return res.status(400).render('admin/login', {
      title: 'Secure Admin Access',
      error: 'Email and password are required.'
    });
  }

  const admin = await authenticateAdmin(email, password);
  if (!admin) {
    return res.status(401).render('admin/login', {
      title: 'Secure Admin Access',
      error: 'Access denied.'
    });
  }

  await Admin.updateOne({ email: admin.email }, { $set: { lastLoginAt: new Date() } });
  setAdminCookie(res, admin);
  return res.redirect(`${env.adminAccessPath}/dashboard`);
}

async function renderDashboard(req, res) {
  const analytics = await Analytics.findOne().lean();
  const [totalVisitors, activeUsers, todayVisitors, monthlyVisitors, totalToolUsage, serverHealth, cloudinaryAssets, cloudinaryStorageRes] = await Promise.all([
    Visitor.countDocuments(),
    Workspace.countDocuments({ expiresAt: { $gt: new Date() } }),
    Visitor.countDocuments({ visitTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    Visitor.countDocuments({ visitTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    ToolUsage.aggregate([{ $group: { _id: null, total: { $sum: '$totalUsage' } } }]),
    Promise.resolve({ status: 'healthy', uptime: process.uptime() }),
    File.countDocuments({ cloudinaryPublicId: { $ne: null } }),
    File.aggregate([
      { $match: { cloudinaryPublicId: { $ne: null } } },
      { $group: { _id: null, total: { $sum: '$fileSize' } } }
    ])
  ]);

  const cloudinarySize = cloudinaryStorageRes[0] ? cloudinaryStorageRes[0].total : 0;
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
      expiredFiles,
      cloudinaryAssets,
      cloudinarySize
    },
    mostUsedTools,
    csrfToken: req.csrfToken()
  });
}

async function handleLogout(req, res) {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.redirect(env.adminAccessPath);
}

async function renderProcessingManagement(req, res) {
  const { getSettings, getServerLoad } = require('../services/settingsService');
  const { getAllTools } = require('../data/toolCatalog');
  
  const settings = await getSettings();
  const serverLoad = getServerLoad();
  
  const [activeFilesCount, expiredFilesCount, cloudinaryAssetsCount, localStorageCount] = await Promise.all([
    File.countDocuments({ expireTime: { $gt: new Date() } }),
    File.countDocuments({ expireTime: { $lte: new Date() } }),
    File.countDocuments({ cloudinaryPublicId: { $ne: null } }),
    File.countDocuments({ storagePath: { $ne: null } })
  ]);

  const allTools = getAllTools();
  
  res.render('admin/processing', {
    title: 'Processing Management | ToolNest',
    systemSettings: settings,
    serverLoad,
    metrics: {
      activeFiles: activeFilesCount,
      expiredFiles: expiredFilesCount,
      cloudinaryAssets: cloudinaryAssetsCount,
      localFiles: localStorageCount
    },
    allTools,
    csrfToken: req.csrfToken(),
    success: req.query.success || null,
    error: req.query.error || null
  });
}

async function updateProcessingSettings(req, res) {
  const { updateSettings } = require('../services/settingsService');
  const { getAllTools } = require('../data/toolCatalog');
  try {
    const data = {
      storageStrategy: req.body.storageStrategy,
      cloudinaryEnabled: req.body.cloudinaryEnabled === 'on',
      browserProcessingEnabled: req.body.browserProcessingEnabled === 'on',
      serverProcessingEnabled: req.body.serverProcessingEnabled === 'on',
      loadBalancerEnabled: req.body.loadBalancerEnabled === 'on',
      loadBalancerThresholdCpu: Number(req.body.loadBalancerThresholdCpu || 80),
      loadBalancerThresholdRam: Number(req.body.loadBalancerThresholdRam || 80),
      downloadRetentionValue: Number(req.body.downloadRetentionValue || 2),
      downloadRetentionUnit: req.body.downloadRetentionUnit || 'minutes',
      fallbackRetentionValue: Number(req.body.fallbackRetentionValue || 10),
      fallbackRetentionUnit: req.body.fallbackRetentionUnit || 'minutes',
      emergencyMode: {
        uploadsDisabled: req.body.uploadsDisabled === 'on',
        videoDisabled: req.body.videoDisabled === 'on',
        audioDisabled: req.body.audioDisabled === 'on',
        cloudinaryUploadsDisabled: req.body.cloudinaryUploadsDisabled === 'on',
        processingDisabled: req.body.processingDisabled === 'on',
        maintenanceMode: req.body.maintenanceMode === 'on'
      }
    };

    const toolOverrides = [];
    const allTools = getAllTools();
    for (const t of allTools) {
      const procMethod = req.body[`override_proc_${t.slug}`];
      const storeMethod = req.body[`override_store_${t.slug}`];
      const limitMb = req.body[`override_limit_${t.slug}`];
      if (procMethod || storeMethod || limitMb) {
        toolOverrides.push({
          toolSlug: t.slug,
          processingMethod: procMethod || 'default',
          storageMethod: storeMethod || 'default',
          uploadLimitMb: limitMb ? parseFloat(limitMb) : undefined
        });
      }
    }
    data.toolOverrides = toolOverrides;

    await updateSettings(data);
    return res.redirect(`${env.adminAccessPath}/processing?success=Settings updated successfully.`);
  } catch (error) {
    return res.redirect(`${env.adminAccessPath}/processing?error=${encodeURIComponent(error.message)}`);
  }
}

async function purgeFiles(req, res) {
  const { removeExpiredFilesAndWorkspaces } = require('../services/cleanupService');
  try {
    const result = await removeExpiredFilesAndWorkspaces();
    return res.redirect(`${env.adminAccessPath}/processing?success=Purged ${result.expiredFiles} expired files and ${result.expiredWorkspaces} expired workspaces.`);
  } catch (error) {
    return res.redirect(`${env.adminAccessPath}/processing?error=${encodeURIComponent(error.message)}`);
  }
}

async function purgeAllFiles(req, res) {
  const { deleteFromCloudinary } = require('../services/cloudinaryService');
  try {
    const allFiles = await File.find().lean();
    for (const file of allFiles) {
      if (file.storagePath) {
        await fs.rm(file.storagePath, { force: true });
      }
      if (file.cloudinaryPublicId) {
        let resourceType = file.cloudinaryResourceType || 'image';
        try {
          await deleteFromCloudinary(file.cloudinaryPublicId, resourceType);
        } catch (e) {
          console.error('Manual purge failed for Cloudinary file', file.cloudinaryPublicId, e.message);
        }
      }
    }

    const workspaces = await Workspace.find().lean();
    for (const w of workspaces) {
      await fs.rm(`${env.uploadsDir}/${w.workspaceId}`, { recursive: true, force: true });
      await fs.rm(`${env.processedDir}/${w.workspaceId}`, { recursive: true, force: true });
      await fs.rm(`${env.tempDir}/${w.workspaceId}`, { recursive: true, force: true });
    }

    await File.deleteMany({});
    await Workspace.deleteMany({});

    return res.redirect(`${env.adminAccessPath}/processing?success=Successfully purged all database entries, workspaces, and Cloudinary storage.`);
  } catch (error) {
    return res.redirect(`${env.adminAccessPath}/processing?error=${encodeURIComponent(error.message)}`);
  }
}

module.exports = {
  handleLogin,
  handleLogout,
  renderDashboard,
  renderLogin,
  renderProcessingManagement,
  updateProcessingSettings,
  purgeFiles,
  purgeAllFiles
};
