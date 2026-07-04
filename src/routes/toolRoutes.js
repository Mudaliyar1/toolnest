const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const upload = require('../middleware/upload');
const toolController = require('../controllers/toolController');

const router = express.Router();

router.get('/:slug', asyncHandler(toolController.renderToolPage));
router.post('/:slug/execute', upload.any(), asyncHandler(toolController.handleToolExecution));

module.exports = router;
