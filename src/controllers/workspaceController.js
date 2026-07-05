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
    let file = await File.findOne({ _id: req.params.fileId, workspaceId: req.workspace.workspaceId }).lean();
    if (!file) {
      file = await File.findOne({ _id: req.params.fileId }).lean();
    }
    if (!file) {
      return next(Object.assign(new Error('File not found.'), { statusCode: 404 }));
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

module.exports = {
  deleteFile,
  downloadFile,
  renderWorkspace
};
