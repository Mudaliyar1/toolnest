const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const workspaceController = require('../controllers/workspaceController');

const router = express.Router();

router.get('/', asyncHandler(workspaceController.renderWorkspace));
router.get('/files/:fileId/download', asyncHandler(workspaceController.downloadFile));
router.post('/files/:fileId/delete', asyncHandler(workspaceController.deleteFile));

module.exports = router;
