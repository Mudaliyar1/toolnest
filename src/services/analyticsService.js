const crypto = require('crypto');
const Analytics = require('../models/Analytics');
const Visitor = require('../models/Visitor');

function getBrowser(userAgent) {
  const value = String(userAgent || '').toLowerCase();
  if (value.includes('firefox')) return 'Firefox';
  if (value.includes('edg')) return 'Edge';
  if (value.includes('chrome')) return 'Chrome';
  if (value.includes('safari')) return 'Safari';
  return 'Unknown';
}

function getDevice(userAgent) {
  const value = String(userAgent || '').toLowerCase();
  if (value.includes('mobile')) return 'Mobile';
  if (value.includes('tablet') || value.includes('ipad')) return 'Tablet';
  return 'Desktop';
}

function getIpHash(req) {
  const ip = req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(String(ip)).digest('hex');
}

async function recordWorkspaceVisit(req) {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const analytics = await Analytics.findOneAndUpdate(
    {},
    { $setOnInsert: { pageViews: 0, sessions: 0, bounceRate: 0, averageSessionDuration: 0 } },
    { upsert: true, returnDocument: 'after' }
  );

  analytics.pageViews += 1;
  if (req.workspaceCreated) {
    analytics.sessions += 1;
  }
  analytics.updatedAt = new Date();
  await analytics.save();

  if (req.workspaceCreated) {
    await Visitor.create({
      ipHash: getIpHash(req),
      country: req.headers['cf-ipcountry'] || 'unknown',
      browser: getBrowser(req.headers['user-agent']),
      device: getDevice(req.headers['user-agent']),
      visitTime: new Date(),
      userAgent: String(req.headers['user-agent'] || 'unknown').slice(0, 255)
    });
  }
}

function analyticsMiddleware(req, res, next) {
  res.on('finish', () => {
    const contentType = String(res.getHeader('content-type') || '');
    if (res.statusCode === 200 && contentType.includes('text/html')) {
      recordWorkspaceVisit(req).catch((error) => {
        console.error('Analytics write failed', error.message);
      });
    }
  });

  next();
}

module.exports = {
  analyticsMiddleware,
  getBrowser,
  getDevice,
  getIpHash,
  recordWorkspaceVisit
};
