const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const publicController = require('../controllers/publicController');

const router = express.Router();

router.get('/', asyncHandler(publicController.renderHome));
router.get('/categories', asyncHandler(publicController.renderCategories));
router.get('/categories/:key', asyncHandler(publicController.renderCategory));
router.get('/privacy', asyncHandler(publicController.renderPrivacy));
router.get('/terms', asyncHandler(publicController.renderTerms));
router.get('/cookies', asyncHandler(publicController.renderCookies));
router.get('/disclaimer', asyncHandler(publicController.renderDisclaimer));
router.get('/data-safety', asyncHandler(publicController.renderDataSafety));
router.get('/contact', asyncHandler(publicController.renderContact));
router.post('/contact', asyncHandler(publicController.handleContactSubmit));
router.get('/about', asyncHandler(publicController.renderAbout));

module.exports = router;

