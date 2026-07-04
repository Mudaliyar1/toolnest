const { analyticsMiddleware } = require('../services/analyticsService');

module.exports = function trafficAnalytics(req, res, next) {
  return analyticsMiddleware(req, res, next);
};
