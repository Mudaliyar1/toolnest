const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
  {
    ipHash: { type: String, required: true, index: true },
    country: { type: String, default: 'unknown', index: true },
    browser: { type: String, default: 'unknown', index: true },
    device: { type: String, default: 'unknown', index: true },
    visitTime: { type: Date, default: Date.now, index: true },
    userAgent: { type: String, default: 'unknown' }
  },
  { versionKey: false }
);

visitorSchema.index({ visitTime: 1 });

module.exports = mongoose.model('Visitor', visitorSchema);
