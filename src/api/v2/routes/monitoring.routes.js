const router = require('express').Router();
const monitoringService = require('../../../services/monitoringService');
const supabaseAdmin = require('../../../services/supabaseAdmin');

/**
 * @swagger
 * /api/v2/monitoring/health:
 *   get:
 *     summary: Check system health
 *     tags: [Monitoring]
 *     description: Returns complete health status of all system components
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         responseTime:
 *                           type: number
 *                     redis:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         responseTime:
 *                           type: number
 *                     memory:
 *                       type: object
 *                       properties:
 *                         status:
 *                           type: string
 *                         heapUsed:
 *                           type: string
 *                         rss:
 *                           type: string
 *                 alerts:
 *                   type: array
 *                   items:
 *                     type: string
 *       503:
 *         description: System degraded
 *       500:
 *         description: Internal server error
 */
router.get('/health', async (req, res) => {
  try {
    const health = await monitoringService.checkSystemHealth();
    const status = health.alerts.length > 0 ? 503 : 200;
    res.status(status).json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v2/monitoring/metrics:
 *   get:
 *     summary: Get performance metrics
 *     tags: [Monitoring]
 *     description: Returns CPU, memory, and uptime metrics
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uptime:
 *                   type: number
 *                   description: Server uptime in seconds
 *                 memory:
 *                   type: object
 *                   properties:
 *                     rss:
 *                       type: number
 *                     heapTotal:
 *                       type: number
 *                     heapUsed:
 *                       type: number
 *                     external:
 *                       type: number
 *                 cpu:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: number
 *                     system:
 *                       type: number
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Internal server error
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = monitoringService.getPerformanceMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v2/monitoring/alert-test:
 *   post:
 *     summary: Test alert system
 *     tags: [Monitoring]
 *     description: Sends a test alert to verify alert system is working
 *     responses:
 *       200:
 *         description: Test alert sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       500:
 *         description: Internal server error
 */
router.post('/alert-test', async (req, res) => {
  try {
    await monitoringService.sendAlerts(['Test alert from API']);
    res.json({ success: true, message: 'Test alert sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/v2/monitoring/alerts:
 *   get:
 *     summary: Get system alerts history
 *     tags: [Monitoring]
 *     description: Returns historical system alerts with filtering options
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           minimum: 1
 *           maximum: 100
 *         description: Number of alerts to return (max 100)
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by severity level
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for filtering (ISO 8601 format)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for filtering (ISO 8601 format)
 *     responses:
 *       200:
 *         description: Alerts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       severity:
 *                         type: string
 *                         enum: [low, medium, high, critical]
 *                       message:
 *                         type: string
 *                       details:
 *                         type: object
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: integer
 *                   description: Number of alerts returned
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       400:
 *         description: Bad request - Invalid parameters
 *       500:
 *         description: Internal server error
 */
router.get('/alerts', async (req, res) => {
  try {
    const { 
      limit = 50, 
      severity, 
      from, 
      to 
    } = req.query;
    
    // Validate limit
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return res.status(400).json({ 
        success: false, 
        error: 'Limit must be between 1 and 100' 
      });
    }
    
    // Build query
    let query = supabaseAdmin.client
      .from('system_alerts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(parsedLimit);
    
    // Apply filters
    if (severity) {
      const validSeverities = ['low', 'medium', 'high', 'critical'];
      if (!validSeverities.includes(severity)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid severity level' 
        });
      }
      query = query.eq('severity', severity);
    }
    
    if (from) {
      query = query.gte('created_at', from);
    }
    
    if (to) {
      query = query.lte('created_at', to);
    }
    
    // Execute query
    const { data, error, count } = await query;
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      data: data || [], 
      count: data ? data.length : 0,
      pagination: {
        limit: parsedLimit,
        total: count || 0
      }
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to fetch alerts'
    });
  }
});

/**
 * @swagger
 * /api/v2/monitoring/alerts/stats:
 *   get:
 *     summary: Get alerts statistics
 *     tags: [Monitoring]
 *     description: Returns statistics about system alerts
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     bySeverity:
 *                       type: object
 *                       properties:
 *                         low:
 *                           type: integer
 *                         medium:
 *                           type: integer
 *                         high:
 *                           type: integer
 *                         critical:
 *                           type: integer
 *                     last24Hours:
 *                       type: integer
 *                     lastWeek:
 *                       type: integer
 *       500:
 *         description: Internal server error
 */
router.get('/alerts/stats', async (req, res) => {
  try {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get total count
    const { count: total } = await supabaseAdmin.client
      .from('system_alerts')
      .select('*', { count: 'exact', head: true });
    
    // Get counts by severity
    const severities = ['low', 'medium', 'high', 'critical'];
    const bySeverity = {};
    
    for (const severity of severities) {
      const { count } = await supabaseAdmin.client
        .from('system_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('severity', severity);
      bySeverity[severity] = count || 0;
    }
    
    // Get last 24 hours count
    const { count: last24HoursCount } = await supabaseAdmin.client
      .from('system_alerts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', last24Hours.toISOString());
    
    // Get last week count
    const { count: lastWeekCount } = await supabaseAdmin.client
      .from('system_alerts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', lastWeek.toISOString());
    
    res.json({
      success: true,
      stats: {
        total: total || 0,
        bySeverity,
        last24Hours: last24HoursCount || 0,
        lastWeek: lastWeekCount || 0
      }
    });
  } catch (error) {
    console.error('Error fetching alert stats:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to fetch statistics'
    });
  }
});

/**
 * @swagger
 * /api/v2/monitoring/websocket/stats:
 *   get:
 *     summary: Get WebSocket connection statistics
 *     tags: [Monitoring]
 *     description: Returns current WebSocket connections and subscriptions
 *     responses:
 *       200:
 *         description: WebSocket statistics retrieved successfully
 */
router.get('/websocket/stats', (req, res) => {
  try {
    const socketService = require('../../../services/socketService');
    const stats = socketService.getStats();
    res.json({
      success: true,
      ...stats,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;