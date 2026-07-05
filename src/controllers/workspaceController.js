const fs = require('fs/promises');
const path = require('path');
const File = require('../models/File');
const Workspace = require('../models/Workspace');
const { validateUploadedFile } = require('../services/fileValidation');
const { scanUploadedFile } = require('../services/fileScanner');
const { findToolBySlug } = require('../data/toolCatalog');

function groupFiles(files) {
  return {
    uploaded: files.filter((file) => file.direction === 'input'),
    processed: files.filter((file) => file.direction === 'output')
  };
}

async function renderWorkspace(req, res) {
  const files = req.workspaceFiles || [];
  res.render('public/workspace', {
    title: 'My Workspace | ToolNest',
    workspace: req.workspace,
    files: groupFiles(files),
    csrfToken: req.csrfToken()
  });
}

async function downloadFile(req, res, next) {
  try {
    let file = await File.findOne({
      _id: req.params.fileId,
      workspaceId: req.workspace.workspaceId,
      expireTime: { $gt: new Date() }
    });
    if (!file) {
      file = await File.findOne({
        _id: req.params.fileId,
        expireTime: { $gt: new Date() }
      });
    }
    if (!file) {
      return next(Object.assign(new Error('File not found.'), { statusCode: 404 }));
    }

    // Set individual active timer upon download click
    const { getSettings, durationToMs } = require('../services/settingsService');
    const settings = await getSettings();
    const activeMs = durationToMs(settings.downloadRetentionValue || 2, settings.downloadRetentionUnit || 'minutes');
    const newExpireTime = new Date(Date.now() + activeMs);

    file.expireTime = newExpireTime;
    await file.save();

    // Extend workspace session to live at least as long as this file
    const workspace = await Workspace.findOne({ workspaceId: file.workspaceId });
    if (workspace && (!workspace.expiresAt || workspace.expiresAt < newExpireTime)) {
      workspace.expiresAt = newExpireTime;
      await workspace.save();
    }

    if (file.cloudinaryUrl) {
      let downloadUrl = file.cloudinaryUrl;
      if (downloadUrl.includes('/upload/')) {
        const baseName = path.basename(file.processedName || 'download', path.extname(file.processedName || ''));
        const cleanName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_');
        downloadUrl = downloadUrl.replace('/upload/', `/upload/fl_attachment:${cleanName}/`);
      }
      return res.redirect(downloadUrl);
    }
    return res.download(file.storagePath, file.processedName || path.basename(file.storagePath));
  } catch (error) {
    return next(error);
  }
}

async function deleteFile(req, res, next) {
  try {
    const file = await File.findOne({ _id: req.params.fileId, workspaceId: req.workspace.workspaceId });
    if (!file) {
      return next(Object.assign(new Error('File not found.'), { statusCode: 404 }));
    }

    if (file.storagePath) {
      await fs.rm(file.storagePath, { force: true });
    }
    if (file.cloudinaryPublicId) {
      const { deleteFromCloudinary } = require('../services/cloudinaryService');
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
    await file.deleteOne();
    return res.redirect('/workspace');
  } catch (error) {
    return next(error);
  }
}

async function getWorkspaceFilesJson(req, res) {
  const files = req.workspaceFiles || [];
  return res.json({
    success: true,
    filesCount: files.length,
    files: files.map(f => ({
      _id: f._id,
      processedName: f.processedName,
      direction: f.direction
    }))
  });
}

async function uploadBrowserResult(req, res, next) {
  try {
    const { getSettings, durationToMs } = require('../services/settingsService');
    const settings = await getSettings();
    const fallbackMs = durationToMs(settings.fallbackRetentionValue || 10, settings.fallbackRetentionUnit || 'minutes');
    const expireTime = new Date(Date.now() + fallbackMs);

    const workspaceId = req.workspace.workspaceId;
    const { ensureWorkspaceDirectories } = require('../services/fileStorageService');
    const directories = await ensureWorkspaceDirectories(workspaceId);

    const createdRecords = [];

    for (const file of req.files || []) {
      // 1. Enforce strict 500MB size limit for browser-processed uploads
      const limitBytes = 500 * 1024 * 1024; // 500MB
      if (file.size > limitBytes) {
        await fs.rm(file.path, { force: true });
        return res.status(400).json({ success: false, reason: `File exceeds 500MB limit.` });
      }

      // 2. Resolve expected tool category to validate file types/signatures
      const toolSlug = req.body.toolName || 'browser-tool';
      const tool = findToolBySlug(toolSlug);
      let expectedCategory = 'other';
      if (tool) {
        expectedCategory = tool.category;
        if (tool.slug === 'image-to-pdf') {
          expectedCategory = 'image';
        } else if (tool.slug === 'gif-to-video') {
          expectedCategory = 'video';
        }
      }

      const safeCategory = expectedCategory === 'pdf' ? 'pdf' : expectedCategory === 'image' ? 'image' : expectedCategory === 'video' ? 'video' : expectedCategory === 'audio' ? 'audio' : null;

      let validationMime = file.mimetype;
      if (safeCategory) {
        const validation = await validateUploadedFile(file.path, file.originalname, safeCategory);
        if (!validation.ok) {
          await fs.rm(file.path, { force: true });
          return res.status(400).json({ success: false, reason: validation.reason });
        }
        if (validation.detectedType && validation.detectedType.mime) {
          validationMime = validation.detectedType.mime;
        }
      }

      // 3. Perform malware heuristic & virus scan to check for scripts/injections
      const scan = await scanUploadedFile(file.path);
      if (!scan.clean) {
        await fs.rm(file.path, { force: true });
        return res.status(400).json({ success: false, reason: scan.reason });
      }

      const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]+/g, '_');
      const storedPath = path.join(directories.outputDir, `${Date.now()}_${safeName}`);
      await fs.rename(file.path, storedPath);

      // Determine storage strategy / Cloudinary upload logic
      const { getProcessingConfigForTool } = require('../services/settingsService');
      const config = getProcessingConfigForTool(settings, tool || { slug: toolSlug, category: 'other' });

      let uploadResult = null;
      if (config.shouldUploadToCloudinary) {
        const { uploadToCloudinary } = require('../services/cloudinaryService');
        try {
          uploadResult = await uploadToCloudinary(storedPath, { folder: `workspace_${workspaceId}` });
        } catch (err) {
          console.warn('Cloudinary upload failed, falling back to local storage:', err.message);
        }
      }

      const record = await File.create({
        workspaceId,
        originalName: file.originalname,
        processedName: safeName,
        fileType: validationMime,
        fileSize: file.size,
        uploadTime: new Date(),
        expireTime,
        storagePath: storedPath,
        cloudinaryPublicId: uploadResult ? uploadResult.publicId : undefined,
        cloudinaryUrl: uploadResult ? uploadResult.url : undefined,
        cloudinaryResourceType: uploadResult ? uploadResult.resourceType : undefined,
        toolName: toolSlug,
        direction: 'output'
      });

      createdRecords.push(record.toObject());
    }

    // Update workspace expiration time
    const latestExpiry = new Date(Date.now() + fallbackMs);
    const workspace = await Workspace.findOne({ workspaceId });
    if (workspace && (!workspace.expiresAt || workspace.expiresAt < latestExpiry)) {
      workspace.expiresAt = latestExpiry;
      await workspace.save();
    }

    return res.json({ success: true, files: createdRecords });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  deleteFile,
  downloadFile,
  renderWorkspace,
  getWorkspaceFilesJson,
  uploadBrowserResult
};
