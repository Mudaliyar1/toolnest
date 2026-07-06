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
  const range = req.query.range || 'all';
  
  // Calculate date boundaries
  let dateFilter = {};
  let days = 30; // default traffic history length
  
  if (range === 'today') {
    dateFilter = { visitTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } };
    days = 1;
  } else if (range === '7days') {
    dateFilter = { visitTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } };
    days = 7;
  } else if (range === '30days') {
    dateFilter = { visitTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } };
    days = 30;
  }

  const fileDateFilter = {};
  if (range === 'today') {
    fileDateFilter.uploadTime = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
  } else if (range === '7days') {
    fileDateFilter.uploadTime = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  } else if (range === '30days') {
    fileDateFilter.uploadTime = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  }

  const trafficDaysLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [
    totalVisitors,
    activeUsers,
    todayVisitors,
    monthlyVisitors,
    totalToolUsageRes,
    serverHealth,
    cloudinaryAssets,
    cloudinaryStorageRes,
    dailyVisits,
    topCountries,
    topBrowsers,
    topDevices,
    mostUsedTools
  ] = await Promise.all([
    Visitor.countDocuments(dateFilter),
    Workspace.countDocuments({ expiresAt: { $gt: new Date() } }),
    Visitor.countDocuments({ visitTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    Visitor.countDocuments({ visitTime: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    range === 'all'
      ? ToolUsage.aggregate([{ $group: { _id: null, total: { $sum: '$totalUsage' } } }])
      : File.aggregate([{ $match: fileDateFilter }, { $group: { _id: null, total: { $sum: 1 } } }]),
    Promise.resolve({ status: 'healthy', uptime: process.uptime() }),
    File.countDocuments({ cloudinaryPublicId: { $ne: null } }),
    File.aggregate([
      { $match: { cloudinaryPublicId: { $ne: null } } },
      { $group: { _id: null, total: { $sum: '$fileSize' } } }
    ]),
    Visitor.aggregate([
      { $match: { visitTime: { $gte: trafficDaysLimit } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$visitTime" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    Visitor.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$country", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]),
    Visitor.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$browser", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]),
    Visitor.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$device", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    range === 'all'
      ? ToolUsage.find().sort({ totalUsage: -1 }).limit(10).lean()
      : File.aggregate([
          { $match: fileDateFilter },
          { $group: { _id: "$toolName", totalUsage: { $sum: 1 } } },
          { $sort: { totalUsage: -1 } },
          { $limit: 10 }
        ]).then(res => res.map(t => ({ toolName: t._id, totalUsage: t.totalUsage })))
  ]);

  const cloudinarySize = cloudinaryStorageRes[0] ? cloudinaryStorageRes[0].total : 0;
  const totalToolUsage = totalToolUsageRes[0] ? totalToolUsageRes[0].total : 0;

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    admin: req.admin,
    currentRange: range,
    metrics: {
      totalVisitors,
      totalSessions: totalVisitors, // Fallback placeholder
      activeUsers,
      todayVisitors,
      monthlyVisitors,
      totalToolUsage,
      serverHealth,
      activeFiles: await File.countDocuments({ expireTime: { $gt: new Date() } }),
      expiredFiles: await File.countDocuments({ expireTime: { $lte: new Date() } }),
      cloudinaryAssets,
      cloudinarySize,
      dailyVisits,
      topCountries,
      topBrowsers,
      topDevices
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
    title: 'Processing Management | RaiseTool',
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
      pwaOfflineCache: req.body.pwaOfflineCache === 'on',
      pwaBackgroundSync: req.body.pwaBackgroundSync === 'on',
      pwaIndexedDbUsage: req.body.pwaIndexedDbUsage === 'on',
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

async function clearPwaCache(req, res) {
  const { getSettings, updateSettings } = require('../services/settingsService');
  try {
    const settings = await getSettings();
    const newVersion = (settings.pwaCacheVersion || 1) + 1;
    await updateSettings({ pwaCacheVersion: newVersion });
    return res.redirect(`${env.adminAccessPath}/processing?success=Successfully triggered dynamic cache purge. All client devices will clear cache and reload on next visit.`);
  } catch (error) {
    return res.redirect(`${env.adminAccessPath}/processing?error=${encodeURIComponent(error.message)}`);
  }
}

async function renderStats(req, res) {
  const { tool, country, device, browser, startDate, endDate } = req.query;
  
  // 1. Build Visitor filter query
  const visitorQuery = {};
  let visitorFilterActive = false;

  if (startDate || endDate) {
    visitorFilterActive = true;
    visitorQuery.visitTime = {};
    if (startDate) {
      visitorQuery.visitTime.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      visitorQuery.visitTime.$lte = end;
    }
  }
  
  if (country && country !== 'all') {
    visitorFilterActive = true;
    visitorQuery.country = country;
  }
  if (device && device !== 'all') {
    visitorFilterActive = true;
    visitorQuery.device = device;
  }
  if (browser && browser !== 'all') {
    visitorFilterActive = true;
    visitorQuery.browser = browser;
  }

  // 2. Fetch matched workspace IDs if visitor filter is active
  let matchedWorkspaceIds = null;
  if (visitorFilterActive) {
    const visitors = await Visitor.find(visitorQuery, 'workspaceId').lean();
    matchedWorkspaceIds = visitors.map(v => v.workspaceId).filter(Boolean);
  }

  // 3. Build File filter query
  const fileQuery = {};
  if (startDate || endDate) {
    fileQuery.uploadTime = {};
    if (startDate) {
      fileQuery.uploadTime.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      fileQuery.uploadTime.$lte = end;
    }
  }
  if (tool && tool !== 'all') {
    fileQuery.toolName = tool;
  }
  if (matchedWorkspaceIds !== null) {
    fileQuery.workspaceId = { $in: matchedWorkspaceIds };
  }

  // 4. Gather detailed metrics
  const [
    filteredVisitorsCount,
    filteredFilesCount,
    filteredCloudinaryCount,
    allCountriesList,
    allBrowsersList,
    allToolsList,
    latestVisits,
    latestFiles,
    dailyTrafficStats,
    toolUsageAggregation,
    fileTypeUsageAggregation
  ] = await Promise.all([
    Visitor.countDocuments(visitorQuery),
    File.countDocuments(fileQuery),
    File.countDocuments({ ...fileQuery, cloudinaryPublicId: { $ne: null } }),
    Visitor.distinct('country'),
    Visitor.distinct('browser'),
    File.distinct('toolName'),
    Visitor.find(visitorQuery).sort({ visitTime: -1 }).limit(30).lean(),
    File.find(fileQuery).sort({ uploadTime: -1 }).limit(30).lean(),
    Visitor.aggregate([
      { $match: visitorQuery },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$visitTime" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    File.aggregate([
      { $match: fileQuery },
      {
        $group: {
          _id: "$toolName",
          filesCount: { $sum: 1 },
          totalSize: { $sum: "$fileSize" },
          cloudinaryCount: {
            $sum: { $cond: [{ $ne: ["$cloudinaryPublicId", null] }, 1, 0] }
          }
        }
      },
      { $sort: { filesCount: -1 } }
    ]),
    File.aggregate([
      { $match: fileQuery },
      {
        $group: {
          _id: "$fileType",
          filesCount: { $sum: 1 },
          totalSize: { $sum: "$fileSize" }
        }
      },
      { $sort: { filesCount: -1 } }
    ])
  ]);

  res.render('admin/stats', {
    title: 'Detailed Statistics | RaiseTool',
    admin: req.admin,
    csrfToken: req.csrfToken(),
    filters: {
      tool: tool || 'all',
      country: country || 'all',
      device: device || 'all',
      browser: browser || 'all',
      startDate: startDate || '',
      endDate: endDate || ''
    },
    options: {
      countries: allCountriesList.filter(Boolean),
      browsers: allBrowsersList.filter(Boolean),
      tools: allToolsList.filter(Boolean)
    },
    metrics: {
      visitorsCount: filteredVisitorsCount,
      filesCount: filteredFilesCount,
      cloudinaryCount: filteredCloudinaryCount,
      latestVisits,
      latestFiles,
      dailyTrafficStats,
      toolUsageStats: toolUsageAggregation,
      fileTypeStats: fileTypeUsageAggregation
    }
  });
}

async function renderPerformance(req, res) {
  const os = require('os');

  function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
  }

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memoryPercentage = ((usedMem / totalMem) * 100).toFixed(1);

  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const cpuLoadPercentage = ((loadAvg[0] / cpus.length) * 100).toFixed(1);

  const processMemory = process.memoryUsage();

  const metrics = {
    osPlatform: os.platform(),
    osRelease: os.release(),
    osArch: os.arch(),
    cpuModel: cpus[0] ? cpus[0].model : 'Unknown CPU',
    cpuCores: cpus.length,
    cpuLoad1m: loadAvg[0].toFixed(2),
    cpuLoad5m: loadAvg[1].toFixed(2),
    cpuLoad15m: loadAvg[2].toFixed(2),
    cpuLoadPercent: Math.min(100, parseFloat(cpuLoadPercentage)),
    memoryTotal: (totalMem / (1024 * 1024 * 1024)).toFixed(2),
    memoryUsed: (usedMem / (1024 * 1024 * 1024)).toFixed(2),
    memoryFree: (freeMem / (1024 * 1024 * 1024)).toFixed(2),
    memoryPercent: memoryPercentage,
    nodeRss: (processMemory.rss / (1024 * 1024)).toFixed(2),
    nodeHeapTotal: (processMemory.heapTotal / (1024 * 1024)).toFixed(2),
    nodeHeapUsed: (processMemory.heapUsed / (1024 * 1024)).toFixed(2),
    nodeExternal: (processMemory.external / (1024 * 1024)).toFixed(2),
    uptimeSystem: formatUptime(os.uptime()),
    uptimeProcess: formatUptime(process.uptime())
  };

  // Query live metrics, database collection documents, and activity feed
  const mongoose = require('mongoose');
  const SystemSettings = require('../models/SystemSettings');
  const { httpTracker } = require('../services/analyticsService');

  const [
    recentUploads,
    processedToday,
    activeWorkspacesToday,
    allTimeProcessed,
    workspaceCount,
    fileCount,
    toolUsageCount,
    visitorCount,
    adminCount,
    analyticsCount,
    settings
  ] = await Promise.all([
    File.find({}).sort({ uploadTime: -1 }).limit(15).lean(),
    File.countDocuments({ uploadTime: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
    Workspace.countDocuments({ lastActivity: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
    File.countDocuments({}),
    Workspace.countDocuments({}),
    File.countDocuments({}),
    ToolUsage.countDocuments({}),
    Visitor.countDocuments({}),
    Admin.countDocuments({}),
    Analytics.countDocuments({}),
    SystemSettings.findOne({}).lean()
  ]);

  const activeSettings = settings || { storageStrategy: 'server', cloudinaryEnabled: false, cloudinaryProcessedJobs: 0 };

  let dbStatus = 'Unknown';
  if (mongoose.connection.readyState === 0) dbStatus = 'Disconnected';
  else if (mongoose.connection.readyState === 1) dbStatus = 'Connected';
  else if (mongoose.connection.readyState === 2) dbStatus = 'Connecting';
  else if (mongoose.connection.readyState === 3) dbStatus = 'Disconnecting';

  const totalRequests = httpTracker.totalRequests;
  const activeRequests = httpTracker.activeRequests;
  const avgLatencyMs = totalRequests > 0 ? (httpTracker.totalLatencyMs / totalRequests).toFixed(1) : '0.0';

  const appDiagnostics = {
    dbStatus,
    dbName: mongoose.connection.name || 'unknown',
    dbHost: `${mongoose.connection.host || 'unknown'}:${mongoose.connection.port || ''}`,
    counts: {
      workspace: workspaceCount,
      file: fileCount,
      toolUsage: toolUsageCount,
      visitor: visitorCount,
      admin: adminCount,
      analytics: analyticsCount
    },
    http: {
      totalRequests,
      activeRequests,
      avgLatencyMs,
      statusCodes: httpTracker.statusCodes
    },
    settings: {
      storageStrategy: activeSettings.storageStrategy || 'server',
      cloudinaryEnabled: activeSettings.cloudinaryEnabled !== false,
      cloudinaryProcessedJobs: activeSettings.cloudinaryProcessedJobs || 0
    },
    node: {
      activeHandles: process._getActiveHandles ? process._getActiveHandles().length : 'N/A',
      activeRequests: process._getActiveRequests ? process._getActiveRequests().length : 'N/A',
      loadedModules: Object.keys(require.cache).length
    }
  };

  res.render('admin/performance', {
    title: 'Server Performance Monitor | RaiseTool',
    admin: req.admin,
    csrfToken: req.csrfToken(),
    metrics,
    recentUploads,
    processedToday,
    activeWorkspacesToday,
    allTimeProcessed,
    appDiagnostics
  });
}

module.exports = {
  handleLogin,
  handleLogout,
  renderDashboard,
  renderLogin,
  renderProcessingManagement,
  updateProcessingSettings,
  purgeFiles,
  purgeAllFiles,
  clearPwaCache,
  renderStats,
  renderPerformance
};
