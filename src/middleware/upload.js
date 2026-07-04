const fs = require('fs');
const path = require('path');
const multer = require('multer');
const env = require('../config/env');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const workspaceId = req.workspace ? req.workspace.workspaceId : 'orphan';
    const targetDir = path.join(env.tempDir, workspaceId);
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename(req, file, cb) {
    const stamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_');
    cb(null, `${stamp}_${safeName}`);
  }
});

module.exports = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
    files: 10
  }
});
