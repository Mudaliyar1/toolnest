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

const { getSettings } = require('../services/settingsService');
const fs = require('fs/promises');
const path = require('path');

router.get('/manifest.json', asyncHandler(async (req, res) => {
  try {
    const settings = await getSettings();
    const manifestPath = path.join(__dirname, '../../public/manifest.json');
    const data = await fs.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(data);
    
    // Set PWA version dynamically based on cache version
    const ver = settings ? (settings.pwaCacheVersion || 1) : 1;
    manifest.version = `1.${ver}.0`;
    
    res.setHeader('Content-Type', 'application/json');
    return res.json(manifest);
  } catch (error) {
    console.error('[PWA Manifest] Failed to load manifest dynamically:', error);
    return res.sendFile(path.join(__dirname, '../../public/manifest.json'));
  }
}));

module.exports = router;

