const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');

async function ensureWorkspaceDirectories(workspaceId) {
  const inputDir = path.join(env.uploadsDir, workspaceId);
  const outputDir = path.join(env.processedDir, workspaceId);
  const tempDir = path.join(env.tempDir, workspaceId);

  await Promise.all([
    fs.mkdir(inputDir, { recursive: true }),
    fs.mkdir(outputDir, { recursive: true }),
    fs.mkdir(tempDir, { recursive: true })
  ]);

  return { inputDir, outputDir, tempDir };
}

function createStorageName(originalName, extension = '') {
  const safeBase = path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'file';
  const suffix = crypto.randomBytes(8).toString('hex');
  return `${safeBase}_${suffix}${extension || path.extname(originalName).toLowerCase()}`;
}

async function removeDirectory(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function copyUploadedFile(sourcePath, targetDirectory, originalName) {
  const storageName = createStorageName(originalName);
  const targetPath = path.join(targetDirectory, storageName);
  await fs.copyFile(sourcePath, targetPath);
  return { storageName, targetPath };
}

module.exports = {
  copyUploadedFile,
  createStorageName,
  ensureWorkspaceDirectories,
  removeDirectory
};
