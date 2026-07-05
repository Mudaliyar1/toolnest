const fs = require('fs/promises');
const path = require('path');
const File = require('../models/File');
const ToolUsage = require('../models/ToolUsage');
const Workspace = require('../models/Workspace');
const { executeTool } = require('../services/toolProcessor');
const { ensureWorkspaceDirectories } = require('../services/fileStorageService');
const { validateUploadedFile } = require('../services/fileValidation');
const { scanUploadedFile } = require('../services/fileScanner');
const { findToolBySlug } = require('../data/toolCatalog');

async function renderToolPage(req, res, next) {
  const tool = findToolBySlug(req.params.slug);

  if (!tool) {
    return next(Object.assign(new Error('Tool not found.'), { statusCode: 404 }));
  }

  try {
    const { getSettings, getProcessingConfigForTool } = require('../services/settingsService');
    const settings = await getSettings();
    const processingConfig = getProcessingConfigForTool(settings, tool);

    return res.render('public/tool', {
      title: `${tool.name} | ToolNest`,
      tool,
      workspace: req.workspace,
      csrfToken: req.csrfToken(),
      result: null,
      processingConfig
    });
  } catch (error) {
    return next(error);
  }
}

async function handleToolExecution(req, res, next) {
  const tool = findToolBySlug(req.params.slug);
  if (!tool) {
    return next(Object.assign(new Error('Tool not found.'), { statusCode: 404 }));
  }
  try {
    const { getSettings, getProcessingConfigForTool, durationToMs } = require('../services/settingsService');
    const settings = await getSettings();
    const processingConfig = getProcessingConfigForTool(settings, tool);

    if (processingConfig.processingDisabled) {
      throw new Error('Tool processing is temporarily disabled by the administrator.');
    }
    if (processingConfig.uploadsDisabled && req.files && req.files.length > 0) {
      throw new Error('File uploads are temporarily disabled by the administrator.');
    }

    const limitBytes = processingConfig.uploadLimitMb * 1024 * 1024;
    const fallbackMs = durationToMs(settings.fallbackRetentionValue || 10, settings.fallbackRetentionUnit || 'minutes');
    const inputExpireTime = new Date(Date.now() + fallbackMs);

    const workspaceId = req.workspace.workspaceId;
    const directories = await ensureWorkspaceDirectories(workspaceId);
    const sanitizedFiles = [];

    for (const file of req.files || []) {
      if (file.size > limitBytes) {
        await fs.rm(file.path, { force: true });
        throw new Error(`File ${file.originalname} exceeds the maximum upload limit of ${processingConfig.uploadLimitMb}MB.`);
      }

      let expectedCategory = tool.category;
      if (tool.slug === 'image-to-pdf') {
        expectedCategory = 'image';
      } else if (tool.slug === 'gif-to-video') {
        expectedCategory = 'video';
      }

      const validation = await validateUploadedFile(
        file.path,
        file.originalname,
        expectedCategory === 'pdf' ? 'pdf' : expectedCategory === 'image' ? 'image' : expectedCategory === 'video' ? 'video' : 'audio'
      );
      if (!validation.ok) {
        await fs.rm(file.path, { force: true });
        throw new Error(validation.reason);
      }

      const scan = await scanUploadedFile(file.path);
      if (!scan.clean) {
        await fs.rm(file.path, { force: true });
        throw new Error(scan.reason);
      }

      const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]+/g, '_');
      const storedPath = path.join(directories.inputDir, `${Date.now()}_${safeName}`);
      await fs.rename(file.path, storedPath);
      sanitizedFiles.push({ ...file, path: storedPath });

      const { uploadToCloudinary } = require('../services/cloudinaryService');
      let uploadResult = null;
      if (processingConfig.shouldUploadToCloudinary) {
        try {
          uploadResult = await uploadToCloudinary(storedPath, { folder: `workspace_${workspaceId}` });
        } catch (err) {
          console.warn('Cloudinary upload failed, falling back to local storage:', err.message);
        }
      }

      await File.create({
        workspaceId,
        originalName: file.originalname,
        processedName: safeName,
        fileType: validation.detectedType.mime,
        fileSize: file.size,
        uploadTime: new Date(),
        expireTime: inputExpireTime,
        storagePath: storedPath,
        cloudinaryPublicId: uploadResult ? uploadResult.publicId : undefined,
        cloudinaryUrl: uploadResult ? uploadResult.url : undefined,
        cloudinaryResourceType: uploadResult ? uploadResult.resourceType : undefined,
        toolName: tool.slug,
        direction: 'input'
      });
    }

    const result = await executeTool({
      slug: tool.slug,
      body: req.body,
      files: sanitizedFiles,
      workspaceId,
      workspaceOutputDir: directories.outputDir
    });

    const createdRecords = [];

    await ToolUsage.updateOne(
      { toolName: tool.name },
      {
        $inc: { totalUsage: 1, dailyUsage: 1, monthlyUsage: 1 },
        $set: { lastUsedAt: new Date() }
      },
      { upsert: true }
    );

    if (result.kind === 'file') {
      const { uploadToCloudinary } = require('../services/cloudinaryService');
      for (const file of result.files) {
        let uploadResult = null;
        if (processingConfig.shouldUploadToCloudinary) {
          try {
            uploadResult = await uploadToCloudinary(file.path, { folder: `workspace_${workspaceId}` });
          } catch (err) {
            console.warn('Cloudinary upload failed, falling back to local storage:', err.message);
          }
        }

        const record = await File.create({
          workspaceId,
          originalName: req.body.originalName || tool.name,
          processedName: file.name,
          fileType: file.mimeType,
          fileSize: (await fs.stat(file.path)).size,
          uploadTime: new Date(),
          expireTime: new Date(Date.now() + fallbackMs), // Timer starts NOW, when file is ready
          storagePath: file.path,
          cloudinaryPublicId: uploadResult ? uploadResult.publicId : undefined,
          cloudinaryUrl: uploadResult ? uploadResult.url : undefined,
          cloudinaryResourceType: uploadResult ? uploadResult.resourceType : undefined,
          toolName: tool.slug,
          direction: 'output'
        });
        createdRecords.push(record.toObject());
      }
    }

    // Update workspace expiration time to live at least as long as the latest file
    const latestExpiry = new Date(Date.now() + fallbackMs);
    const workspace = await Workspace.findOne({ workspaceId });
    if (workspace && (!workspace.expiresAt || workspace.expiresAt < latestExpiry)) {
      workspace.expiresAt = latestExpiry;
      await workspace.save();
      req.workspace.expiresAt = latestExpiry;
    }

    return res.render('public/tool', {
      title: `${tool.name} | ToolNest`,
      tool,
      workspace: req.workspace,
      csrfToken: req.csrfToken(),
      result,
      resultRecords: createdRecords,
      processingConfig
    });
  } catch (error) {
    let processingConfig = null;
    try {
      const { getSettings } = require('../services/settingsService');
      const settings = await getSettings();
      const override = settings.toolOverrides.find(o => o.toolSlug === tool.slug) || {};
      
      let method = override.processingMethod || 'default';
      if (method === 'default') {
        if (settings.storageStrategy === 'browser') {
          method = 'browser';
        } else if (settings.storageStrategy === 'server') {
          method = 'server';
        } else if (settings.storageStrategy === 'cloudinary') {
          method = 'cloudinary';
        } else {
          if (['video', 'audio'].includes(tool.category)) {
            method = 'server';
          } else {
            method = 'browser';
          }
        }
      }
      
      if (settings.loadBalancerEnabled && method !== 'browser') {
        const { getServerLoad } = require('../services/settingsService');
        const load = getServerLoad();
        if (load.cpu > settings.loadBalancerThresholdCpu || load.ram > settings.loadBalancerThresholdRam) {
          if (!['video', 'audio'].includes(tool.category)) {
            method = 'browser';
          }
        }
      }
      
      if (settings.emergencyMode.processingDisabled) {
        method = 'disabled';
      }

      processingConfig = {
        method,
        uploadLimitMb: override.uploadLimitMb || 15,
        uploadsDisabled: settings.emergencyMode.uploadsDisabled,
        processingDisabled: settings.emergencyMode.processingDisabled
      };
    } catch (e) {
      processingConfig = {
        method: 'server',
        uploadLimitMb: 15,
        uploadsDisabled: false,
        processingDisabled: false
      };
    }

    return res.render('public/tool', {
      title: `${tool.name} | ToolNest`,
      tool,
      workspace: req.workspace,
      csrfToken: req.csrfToken(),
      result: {
        kind: 'error',
        title: 'Error Processing Tool',
        content: error.message
      },
      resultRecords: [],
      processingConfig
    });
  }
}

module.exports = {
  handleToolExecution,
  renderToolPage
};
