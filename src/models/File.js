const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    originalName: { type: String, required: true },
    processedName: { type: String, required: true },
    fileType: { type: String, required: true, index: true },
    fileSize: { type: Number, required: true },
    uploadTime: { type: Date, default: Date.now, index: true },
    expireTime: { type: Date, required: true, index: true },
    storagePath: { type: String, required: true },
    toolName: { type: String, required: true, index: true },
    direction: { type: String, enum: ['input', 'output'], default: 'output' }
  },
  { versionKey: false }
);

fileSchema.index({ expireTime: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('File', fileSchema);
