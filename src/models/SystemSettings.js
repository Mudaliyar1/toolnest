const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema(
  {
    storageStrategy: {
      type: String,
      enum: ['hybrid', 'browser', 'cloudinary', 'server'],
      default: 'hybrid'
    },
    cloudinaryEnabled: { type: Boolean, default: true },
    browserProcessingEnabled: { type: Boolean, default: true },
    serverProcessingEnabled: { type: Boolean, default: true },
    loadBalancerEnabled: { type: Boolean, default: false },
    loadBalancerThresholdCpu: { type: Number, default: 80 },
    loadBalancerThresholdRam: { type: Number, default: 80 },
    fileRetentionMinutes: { type: Number, default: 10 },
    downloadRetentionValue: { type: Number, default: 2 },
    downloadRetentionUnit: {
      type: String,
      enum: ['seconds', 'minutes', 'hours'],
      default: 'minutes'
    },
    fallbackRetentionValue: { type: Number, default: 10 },
    fallbackRetentionUnit: {
      type: String,
      enum: ['seconds', 'minutes', 'hours'],
      default: 'minutes'
    },
    emergencyMode: {
      uploadsDisabled: { type: Boolean, default: false },
      videoDisabled: { type: Boolean, default: false },
      audioDisabled: { type: Boolean, default: false },
      cloudinaryUploadsDisabled: { type: Boolean, default: false },
      processingDisabled: { type: Boolean, default: false },
      maintenanceMode: { type: Boolean, default: false }
    },
    toolOverrides: [
      {
        toolSlug: { type: String, required: true },
        processingMethod: {
          type: String,
          enum: ['default', 'browser', 'server', 'cloudinary'],
          default: 'default'
        },
        storageMethod: {
          type: String,
          enum: ['default', 'browser', 'server', 'cloudinary'],
          default: 'default'
        },
        uploadLimitMb: { type: Number }
      }
    ],
    analytics: {
      browserProcessedJobs: { type: Number, default: 0 },
      browserSuccessCount: { type: Number, default: 0 },
      browserFailureCount: { type: Number, default: 0 },
      serverProcessedJobs: { type: Number, default: 0 },
      cloudinaryProcessedJobs: { type: Number, default: 0 },
      storageSavingsBytes: { type: Number, default: 0 }
    }
  },
  { versionKey: false }
);

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
