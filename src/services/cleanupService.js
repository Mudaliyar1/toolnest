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

  for (const file of expiredFiles) {
    await fs.rm(file.storagePath, { force: true });
  }

  for (const workspace of expiredWorkspaces) {
    await fs.rm(`${env.uploadsDir}/${workspace.workspaceId}`, { recursive: true, force: true });
    await fs.rm(`${env.processedDir}/${workspace.workspaceId}`, { recursive: true, force: true });
    await fs.rm(`${env.tempDir}/${workspace.workspaceId}`, { recursive: true, force: true });
  }

  await File.deleteMany({ _id: { $in: expiredFiles.map((file) => file._id) } });
  await Workspace.deleteMany({ _id: { $in: expiredWorkspaces.map((workspace) => workspace._id) } });

  return {
    expiredFiles: expiredFiles.length,
    expiredWorkspaces: expiredWorkspaces.length
  };
}

module.exports = {
  removeExpiredFilesAndWorkspaces
};
