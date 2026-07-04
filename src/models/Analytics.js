const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema(
  {
    pageViews: { type: Number, default: 0 },
    sessions: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
    averageSessionDuration: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

module.exports = mongoose.model('Analytics', analyticsSchema);
