const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, unique: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, required: true, index: true },
    lastActivity: { type: Date, default: Date.now, index: true }
  },
  { versionKey: false }
);

workspaceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Workspace', workspaceSchema);
