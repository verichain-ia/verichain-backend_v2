const router = require('express').Router();
const { protect } = require('../../../middleware/auth');
const webhookService = require('../../../services/webhookService');
const ResponseFormatter = require('../../../middleware/responseFormatter');

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: Webhook configuration and management
 */

/**
 * @swagger
 * /api/v2/webhooks/config:
 *   get:
 *     summary: Get webhook configuration
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current webhook configuration
 */
router.get('/config', protect, async (req, res, next) => {
  try {
    const config = await webhookService.getOrgWebhookConfig(req.user.organization_id);
    ResponseFormatter.success(res, config);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v2/webhooks/config:
 *   post:
 *     summary: Create or update webhook configuration
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 example: "https://example.com/webhook"
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["certificate.created", "certificate.verified"]
 *               secret:
 *                 type: string
 *               enabled:
 *                 type: boolean
 */
router.post('/config', protect, async (req, res, next) => {
  try {
    const { url, events, secret, enabled = true } = req.body;
    
    // Validate URL
    new URL(url);
    
    // Save configuration
    const { data, error } = await supabaseAdmin.client
      .from('webhook_configs')
      .upsert({
        organization_id: req.user.organization_id,
        url,
        events,
        secret,
        enabled,
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) throw error;
    
    ResponseFormatter.success(res, data[0], 'Webhook configuration saved');
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v2/webhooks/test:
 *   post:
 *     summary: Test webhook configuration
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 */
router.post('/test', protect, async (req, res, next) => {
  try {
    const config = await webhookService.getOrgWebhookConfig(req.user.organization_id);
    
    if (!config) {
      return ResponseFormatter.error(res, 'No webhook configured', 404);
    }

    await webhookService.send(
      config.url,
      'test.webhook',
      { message: 'Test webhook from VeriChain' },
      config.secret,
      req.user.organization_id
    );

    ResponseFormatter.success(res, { delivered: true }, 'Test webhook sent');
  } catch (error) {
    ResponseFormatter.error(res, 'Webhook test failed: ' + error.message, 400);
  }
});

/**
 * @swagger
 * /api/v2/webhooks/logs:
 *   get:
 *     summary: Get webhook delivery logs
 *     tags: [Webhooks]
 *     security:
 *       - bearerAuth: []
 */
router.get('/logs', protect, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.client
      .from('webhook_logs')
      .select('*')
      .eq('organization_id', req.user.organization_id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    
    ResponseFormatter.success(res, data);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
