const mongoose = require('mongoose');

const securityEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true },
    ipHash: { type: String, required: true, index: true },
    severity: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'critical'], 
      default: 'low',
      index: true 
    },
    timestamp: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

module.exports = mongoose.model('SecurityEvent', securityEventSchema);
