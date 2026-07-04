const fs = require('fs/promises');
const path = require('path');
const File = require('../models/File');
const ToolUsage = require('../models/ToolUsage');
const { executeTool } = require('../services/toolProcessor');
const { ensureWorkspaceDirectories } = require('../services/fileStorageService');
const { validateUploadedFile } = require('../services/fileValidation');
const { scanUploadedFile } = require('../services/fileScanner');
const { findToolBySlug } = require('../data/toolCatalog');

function renderToolPage(req, res, next) {
  const tool = findToolBySlug(req.params.slug);

  if (!tool) {
    return next(Object.assign(new Error('Tool not found.'), { statusCode: 404 }));
  }

  return res.render('public/tool', {
    title: `${tool.name} | ToolNest`,
    tool,
    workspace: req.workspace,
    csrfToken: req.csrfToken(),
    result: null
  });
}

async function handleToolExecution(req, res, next) {
  try {
    const tool = findToolBySlug(req.params.slug);
    if (!tool) {
      return next(Object.assign(new Error('Tool not found.'), { statusCode: 404 }));
    }

    const workspaceId = req.workspace.workspaceId;
    const directories = await ensureWorkspaceDirectories(workspaceId);
    const sanitizedFiles = [];

    for (const file of req.files || []) {
      const category = tool.category;
      const validation = await validateUploadedFile(file.path, file.originalname, category === 'pdf' ? 'pdf' : category === 'image' ? 'image' : category === 'video' ? 'video' : 'audio');
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

      await File.create({
        workspaceId,
        originalName: file.originalname,
        processedName: safeName,
        fileType: validation.detectedType.mime,
        fileSize: file.size,
        uploadTime: new Date(),
        expireTime: new Date(Date.now() + 10 * 60 * 1000),
        storagePath: storedPath,
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
      for (const file of result.files) {
        const record = await File.create({
          workspaceId,
          originalName: req.body.originalName || tool.name,
          processedName: file.name,
          fileType: file.mimeType,
          fileSize: (await fs.stat(file.path)).size,
          uploadTime: new Date(),
          expireTime: new Date(Date.now() + 10 * 60 * 1000),
          storagePath: file.path,
          toolName: tool.slug,
          direction: 'output'
        });
        createdRecords.push(record.toObject());
      }
    }

    return res.render('public/tool', {
      title: `${tool.name} | ToolNest`,
      tool,
      workspace: req.workspace,
      csrfToken: req.csrfToken(),
      result,
      resultRecords: createdRecords
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  handleToolExecution,
  renderToolPage
};
