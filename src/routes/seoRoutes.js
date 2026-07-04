const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const seoController = require('../controllers/seoController');

const router = express.Router();

router.get('/robots.txt', asyncHandler(seoController.robots));
router.get('/sitemap.xml', asyncHandler(seoController.sitemap));

module.exports = router;
