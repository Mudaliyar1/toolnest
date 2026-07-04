const mongoose = require('mongoose');

const toolUsageSchema = new mongoose.Schema(
  {
    toolName: { type: String, required: true, unique: true, index: true },
    totalUsage: { type: Number, default: 0 },
    dailyUsage: { type: Number, default: 0 },
    monthlyUsage: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: Date.now }
  },
  { versionKey: false }
);

module.exports = mongoose.model('ToolUsage', toolUsageSchema);
