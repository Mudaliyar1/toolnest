const os = require('os');
const SystemSettings = require('../models/SystemSettings');

// These tool categories MUST always be processed on the server.
// No admin configuration can override this — they have no browser implementation.
// Note: 'video' and 'audio' have been removed — they now support FFmpeg.wasm browser processing.
const SERVER_ONLY_CATEGORIES = new Set(['pdf']);

// These specific tool slugs must always run server-side regardless of category.
const SERVER_ONLY_TOOL_SLUGS = new Set([
  'background-removal', 'image-upscaler', 'thumbnail-generator',
  'barcode-generator', 'qr-generator', 'invoice-generator'
]);

let cachedSettings = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5000; // Cache settings for 5 seconds

const DEFAULT_SETTINGS = {
  storageStrategy: 'hybrid',
  cloudinaryEnabled: true,
  browserProcessingEnabled: true,
  serverProcessingEnabled: true,
  loadBalancerEnabled: false,
  loadBalancerThresholdCpu: 80,
  loadBalancerThresholdRam: 80,
  fileRetentionMinutes: 10,
  downloadRetentionValue: 2,
  downloadRetentionUnit: 'minutes',
  fallbackRetentionValue: 10,
  fallbackRetentionUnit: 'minutes',
  emergencyMode: {
    uploadsDisabled: false,
    videoDisabled: false,
    audioDisabled: false,
    cloudinaryUploadsDisabled: false,
    processingDisabled: false,
    maintenanceMode: false
  },
  toolOverrides: [],
  analytics: {
    browserProcessedJobs: 0,
    browserSuccessCount: 0,
    browserFailureCount: 0,
    serverProcessedJobs: 0,
    cloudinaryProcessedJobs: 0,
    storageSavingsBytes: 0
  }
};

/**
 * Fetches the active system settings, falling back to defaults if database is offline.
 * Caches settings in-memory to prevent overhead.
 */
async function getSettings() {
  const now = Date.now();
  if (cachedSettings && (now - lastCacheTime < CACHE_TTL_MS)) {
    return cachedSettings;
  }

  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return DEFAULT_SETTINGS;
    }

    let settings = await SystemSettings.findOne().lean();
    if (!settings) {
      // Create default settings if not exists
      settings = await SystemSettings.create(DEFAULT_SETTINGS);
      settings = settings.toObject();
    }

    cachedSettings = settings;
    lastCacheTime = now;
    return settings;
  } catch (error) {
    console.error('Failed to load system settings from MongoDB:', error.message);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Updates the system settings in the database and refreshes the cache.
 */
async function updateSettings(data) {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database is offline, settings cannot be updated.');
  }

  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = new SystemSettings(DEFAULT_SETTINGS);
  }

  // Update root fields
  if (data.storageStrategy !== undefined) settings.storageStrategy = data.storageStrategy;
  if (data.cloudinaryEnabled !== undefined) settings.cloudinaryEnabled = !!data.cloudinaryEnabled;
  if (data.browserProcessingEnabled !== undefined) settings.browserProcessingEnabled = !!data.browserProcessingEnabled;
  if (data.serverProcessingEnabled !== undefined) settings.serverProcessingEnabled = !!data.serverProcessingEnabled;
  if (data.loadBalancerEnabled !== undefined) settings.loadBalancerEnabled = !!data.loadBalancerEnabled;
  if (data.loadBalancerThresholdCpu !== undefined) settings.loadBalancerThresholdCpu = Number(data.loadBalancerThresholdCpu);
  if (data.loadBalancerThresholdRam !== undefined) settings.loadBalancerThresholdRam = Number(data.loadBalancerThresholdRam);
  if (data.fileRetentionMinutes !== undefined) settings.fileRetentionMinutes = Number(data.fileRetentionMinutes);
  if (data.downloadRetentionValue !== undefined) settings.downloadRetentionValue = Number(data.downloadRetentionValue);
  if (data.downloadRetentionUnit !== undefined) settings.downloadRetentionUnit = data.downloadRetentionUnit;
  if (data.fallbackRetentionValue !== undefined) settings.fallbackRetentionValue = Number(data.fallbackRetentionValue);
  if (data.fallbackRetentionUnit !== undefined) settings.fallbackRetentionUnit = data.fallbackRetentionUnit;

  // Update emergencyMode
  if (data.emergencyMode) {
    if (data.emergencyMode.uploadsDisabled !== undefined) settings.emergencyMode.uploadsDisabled = !!data.emergencyMode.uploadsDisabled;
    if (data.emergencyMode.videoDisabled !== undefined) settings.emergencyMode.videoDisabled = !!data.emergencyMode.videoDisabled;
    if (data.emergencyMode.audioDisabled !== undefined) settings.emergencyMode.audioDisabled = !!data.emergencyMode.audioDisabled;
    if (data.emergencyMode.cloudinaryUploadsDisabled !== undefined) settings.emergencyMode.cloudinaryUploadsDisabled = !!data.emergencyMode.cloudinaryUploadsDisabled;
    if (data.emergencyMode.processingDisabled !== undefined) settings.emergencyMode.processingDisabled = !!data.emergencyMode.processingDisabled;
    if (data.emergencyMode.maintenanceMode !== undefined) settings.emergencyMode.maintenanceMode = !!data.emergencyMode.maintenanceMode;
  }

  // Update toolOverrides
  if (data.toolOverrides !== undefined) {
    settings.toolOverrides = data.toolOverrides;
  }

  await settings.save();
  cachedSettings = settings.toObject();
  lastCacheTime = Date.now();
  return cachedSettings;
}

/**
 * Increments an analytics metric.
 */
async function incrementAnalytics(metricPath, value = 1) {
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) return;

    const incQuery = {};
    incQuery[`analytics.${metricPath}`] = value;

    await SystemSettings.updateOne({}, { $inc: incQuery }, { upsert: true });
    
    // Invalidate cache
    cachedSettings = null;
    lastCacheTime = 0;
  } catch (error) {
    console.error(`Failed to increment analytics metric ${metricPath}:`, error.message);
  }
}

/**
 * Returns RAM and CPU loads.
 */
function getServerLoad() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ramUsagePercent = Math.round((1 - freeMem / totalMem) * 100);

  // os.loadavg() doesn't work on Windows, calculate CPU usage via ticks
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  
  // Return simulated load based on memory usage or basic active threads on Windows if needed
  const loadavg = os.loadavg();
  let cpuUsagePercent = 0;
  if (loadavg && loadavg[0] > 0) {
    cpuUsagePercent = Math.round((loadavg[0] / os.cpus().length) * 100);
  } else {
    // Windows fallback: match a fraction of RAM usage or random minor activity
    cpuUsagePercent = Math.min(95, Math.max(10, Math.round(ramUsagePercent * 0.7)));
  }

  return {
    cpu: Math.min(100, Math.max(0, cpuUsagePercent)),
    ram: Math.min(100, Math.max(0, ramUsagePercent))
  };
}

/**
 * Resolves the processing configuration for a tool.
 */
function getProcessingConfigForTool(settings, tool) {
  const override = (settings.toolOverrides || []).find(o => o.toolSlug === tool.slug) || {};
  
  // Determine if tool is server-only (no browser implementation exists)
  const isServerOnly = SERVER_ONLY_CATEGORIES.has(tool.category) || SERVER_ONLY_TOOL_SLUGS.has(tool.slug);

  let method = override.processingMethod || 'default';

  // If admin explicitly set a processing method for this tool, respect it
  // but still enforce server-only constraint
  if (method !== 'default') {
    if (method === 'browser' && isServerOnly) {
      method = 'server'; // Silently correct invalid admin override
    }
  } else {
    // Resolve 'default' based on global storageStrategy
    if (settings.storageStrategy === 'browser') {
      method = isServerOnly ? 'server' : 'browser';
    } else if (settings.storageStrategy === 'server') {
      method = 'server';
    } else if (settings.storageStrategy === 'cloudinary') {
      method = isServerOnly ? 'server' : 'cloudinary';
    } else {
      // hybrid or any unknown value — server-only tools use server, rest use browser
      method = isServerOnly ? 'server' : 'browser';
    }
  }

  // Load balancer can only redirect non-server-only tools to browser
  if (settings.loadBalancerEnabled && method !== 'browser') {
    const load = getServerLoad();
    if (load.cpu > settings.loadBalancerThresholdCpu || load.ram > settings.loadBalancerThresholdRam) {
      if (!isServerOnly) {
        method = 'browser';
      }
    }
  }
  
  if (settings.emergencyMode.processingDisabled) {
    method = 'disabled';
  }

  // Resolve storage method
  let storageMethod = override.storageMethod || 'default';
  if (storageMethod === 'default') {
    if (settings.storageStrategy === 'server') {
      storageMethod = 'server';
    } else if (settings.storageStrategy === 'cloudinary') {
      storageMethod = 'cloudinary';
    } else if (settings.storageStrategy === 'browser') {
      storageMethod = 'server';
    } else {
      // hybrid strategy: use cloudinary if enabled, fallback to server
      storageMethod = settings.cloudinaryEnabled ? 'cloudinary' : 'server';
    }
  }

  const isCloudinaryAllowed = storageMethod === 'cloudinary' && settings.cloudinaryEnabled;
  const shouldUploadToCloudinary = isCloudinaryAllowed && !settings.emergencyMode.cloudinaryUploadsDisabled;

  return {
    method,
    uploadLimitMb: override.uploadLimitMb || 15,
    uploadsDisabled: !!settings.emergencyMode.uploadsDisabled,
    processingDisabled: !!settings.emergencyMode.processingDisabled,
    shouldUploadToCloudinary
  };
}

/**
 * Converts a value and duration unit to milliseconds.
 */
function durationToMs(value, unit) {
  const v = Number(value) || 0;
  switch (unit) {
    case 'seconds':
      return v * 1000;
    case 'hours':
      return v * 60 * 60 * 1000;
    case 'minutes':
    default:
      return v * 60 * 1000;
  }
}

module.exports = {
  getSettings,
  updateSettings,
  incrementAnalytics,
  getServerLoad,
  getProcessingConfigForTool,
  durationToMs
};
