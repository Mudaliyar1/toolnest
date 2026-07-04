const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

router.get('/', asyncHandler(adminController.renderLogin));
router.post('/', asyncHandler(adminController.handleLogin));
router.get('/dashboard', adminAuth, asyncHandler(adminController.renderDashboard));
router.post('/logout', adminAuth, asyncHandler(adminController.handleLogout));

module.exports = router;
