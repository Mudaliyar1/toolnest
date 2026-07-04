const fs = require('fs/promises');
const path = require('path');
const File = require('../models/File');

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
    const file = await File.findOne({ _id: req.params.fileId, workspaceId: req.workspace.workspaceId }).lean();
    if (!file) {
      return next(Object.assign(new Error('File not found.'), { statusCode: 404 }));
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

    await fs.rm(file.storagePath, { force: true });
    await file.deleteOne();
    return res.redirect('/workspace');
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  deleteFile,
  downloadFile,
  renderWorkspace
};
