const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

router.get('/', asyncHandler(adminController.renderLogin));
router.post('/', asyncHandler(adminController.handleLogin));
router.get('/dashboard', adminAuth, asyncHandler(adminController.renderDashboard));
router.get('/stats', adminAuth, asyncHandler(adminController.renderStats));
router.get('/performance', adminAuth, asyncHandler(adminController.renderPerformance));
router.post('/logout', adminAuth, asyncHandler(adminController.handleLogout));
router.get('/processing', adminAuth, asyncHandler(adminController.renderProcessingManagement));
router.post('/processing', adminAuth, asyncHandler(adminController.updateProcessingSettings));
router.post('/processing/purge', adminAuth, asyncHandler(adminController.purgeFiles));
router.post('/processing/purge-all', adminAuth, asyncHandler(adminController.purgeAllFiles));
router.post('/processing/clear-pwa-cache', adminAuth, asyncHandler(adminController.clearPwaCache));

module.exports = router;
