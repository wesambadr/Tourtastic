const express = require('express');
const { handleSeeruWebhook } = require('../controllers/webhookController');

const router = express.Router();

/**
 * Seeru webhook endpoint
 * This endpoint receives notifications from Seeru Travel API
 * No authentication required (but should validate webhook signature in production)
 */
router.post('/seeru', handleSeeruWebhook);

module.exports = router;
