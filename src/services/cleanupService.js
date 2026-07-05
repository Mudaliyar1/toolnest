const fs = require('fs/promises');
const mongoose = require('mongoose');
const Workspace = require('../models/Workspace');
const File = require('../models/File');
const env = require('../config/env');

async function removeExpiredFilesAndWorkspaces() {
  if (mongoose.connection.readyState !== 1) {
    return {
      expiredFiles: 0,
      expiredWorkspaces: 0,
      skipped: true
    };
  }

  const now = new Date();
  const expiredFiles = await File.find({ expireTime: { $lte: now } }).lean();
  const expiredWorkspaces = await Workspace.find({ expiresAt: { $lte: now } }).lean();

  // Find all files belonging to expired workspaces to prevent orphans on Cloudinary/Disk
  const expiredWorkspaceIds = expiredWorkspaces.map((w) => w.workspaceId);
  const filesOfExpiredWorkspaces = expiredWorkspaceIds.length > 0
    ? await File.find({ workspaceId: { $in: expiredWorkspaceIds } }).lean()
    : [];

  const allFilesToDelete = [...expiredFiles];
  const fileIdsSet = new Set(expiredFiles.map((f) => String(f._id)));
  for (const f of filesOfExpiredWorkspaces) {
    if (!fileIdsSet.has(String(f._id))) {
      allFilesToDelete.push(f);
      fileIdsSet.add(String(f._id));
    }
  }

  const { deleteFromCloudinary } = require('./cloudinaryService');

  for (const file of allFilesToDelete) {
    if (file.storagePath) {
      await fs.rm(file.storagePath, { force: true });
    }
    if (file.cloudinaryPublicId) {
      let resourceType = file.cloudinaryResourceType;
      if (!resourceType) {
        resourceType = 'raw';
        if (file.fileType) {
          if (file.fileType.startsWith('image/') || file.fileType === 'application/pdf') {
            resourceType = 'image';
          } else if (file.fileType.startsWith('video/') || file.fileType.startsWith('audio/')) {
            resourceType = 'video';
          }
        }
      }
      try {
        await deleteFromCloudinary(file.cloudinaryPublicId, resourceType);
      } catch (err) {
        console.error(`Failed to delete Cloudinary asset ${file.cloudinaryPublicId}:`, err.message);
      }
    }
  }

  for (const workspace of expiredWorkspaces) {
    await fs.rm(`${env.uploadsDir}/${workspace.workspaceId}`, { recursive: true, force: true });
    await fs.rm(`${env.processedDir}/${workspace.workspaceId}`, { recursive: true, force: true });
    await fs.rm(`${env.tempDir}/${workspace.workspaceId}`, { recursive: true, force: true });
  }

  if (allFilesToDelete.length > 0) {
    await File.deleteMany({ _id: { $in: allFilesToDelete.map((file) => file._id) } });
  }
  if (expiredWorkspaces.length > 0) {
    await Workspace.deleteMany({ _id: { $in: expiredWorkspaces.map((workspace) => workspace._id) } });
  }

  return {
    expiredFiles: expiredFiles.length,
    expiredWorkspaces: expiredWorkspaces.length
  };
}

module.exports = {
  removeExpiredFilesAndWorkspaces
};
