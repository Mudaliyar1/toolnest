const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const workspaceController = require('../controllers/workspaceController');
const upload = require('../middleware/upload');

const router = express.Router();

router.get('/', asyncHandler(workspaceController.renderWorkspace));
router.get('/api/files', asyncHandler(workspaceController.getWorkspaceFilesJson));
router.get('/files/:fileId/download', asyncHandler(workspaceController.downloadFile));
router.post('/files/:fileId/delete', asyncHandler(workspaceController.deleteFile));
router.post('/upload-browser-result', upload.any(), asyncHandler(workspaceController.uploadBrowserResult));

module.exports = router;
