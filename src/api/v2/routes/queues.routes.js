const router = require('express').Router();
const { protect } = require('../../../middleware/auth');
const QueueManager = require('../../../queues/queueConfig');
const ResponseFormatter = require('../../../middleware/responseFormatter');

/**
 * @swagger
 * components:
 *   schemas:
 *     QueueStatus:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "blockchainRegistration"
 *         status:
 *           type: string
 *           enum: [active, paused]
 *         counts:
 *           type: object
 *           properties:
 *             waiting:
 *               type: integer
 *             active:
 *               type: integer
 *             completed:
 *               type: integer
 *             failed:
 *               type: integer
 *             delayed:
 *               type: integer
 *             total:
 *               type: integer
 *         metrics:
 *           type: object
 *           properties:
 *             successRate:
 *               type: string
 *               example: "95.5%"
 *             failureRate:
 *               type: string
 *               example: "4.5%"
 *             throughput:
 *               type: string
 *               example: "120 jobs/min"
 *         health:
 *           type: string
 *           enum: [healthy, warning, critical, idle]
 *     Job:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         data:
 *           type: object
 *         progress:
 *           type: integer
 *           minimum: 0
 *           maximum: 100
 *         attemptsMade:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         processedAt:
 *           type: string
 *           format: date-time
 *         failedReason:
 *           type: string
 */

/**
 * @swagger
 * tags:
 *   name: Queues
 *   description: Job queue management and monitoring
 */

/**
 * @swagger
 * /api/v1/queues/status:
 *   get:
 *     summary: Get status of all queues
 *     tags: [Queues]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Queue status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 overallHealth:
 *                   type: string
 *                   enum: [healthy, warning, critical]
 *                 totalQueues:
 *                   type: integer
 *                 queues:
 *                   type: object
 *                   additionalProperties:
 *                     $ref: '#/components/schemas/QueueStatus'
 *       403:
 *         description: Insufficient permissions (admin only)
 *       401:
 *         description: Unauthorized
 */
router.get('/status', protect, async (req, res, next) => {
  try {
    // Solo admin puede ver estado de queues
    if (!['super_admin', 'org_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }
    
    const status = await QueueManager.getInstance().getAllQueuesStatus();
    
    ResponseFormatter.success(res, status);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/queues/{queueName}/jobs:
 *   get:
 *     summary: Get jobs from specific queue
 *     tags: [Queues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [blockchainRegistration, emailNotifications, certificateGeneration, pdfGeneration, analyticsProcessing]
 *         description: Name of the queue
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [waiting, active, completed, failed]
 *           default: waiting
 *         description: Job status filter
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Maximum number of jobs to return
 *     responses:
 *       200:
 *         description: List of jobs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 queue:
 *                   type: string
 *                 status:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 jobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Job'
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Queue not found
 */
router.get('/:queueName/jobs', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super admin only'
      });
    }
    
    const { queueName } = req.params;
    const { status = 'waiting', limit = 10 } = req.query;
    
    const queue = await queueManager.getQueue(queueName);
    let jobs;
    
    switch(status) {
      case 'waiting':
        jobs = await queue.getWaiting(0, limit);
        break;
      case 'active':
        jobs = await queue.getActive(0, limit);
        break;
      case 'completed':
        jobs = await queue.getCompleted(0, limit);
        break;
      case 'failed':
        jobs = await queue.getFailed(0, limit);
        break;
      default:
        jobs = [];
    }
    
    const jobData = jobs.map(job => ({
      id: job.id,
      data: job.data,
      progress: job.progress(),
      attemptsMade: job.attemptsMade,
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : null,
      failedReason: job.failedReason
    }));
    
    ResponseFormatter.success(res, {
      queue: queueName,
      status,
      count: jobData.length,
      jobs: jobData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/queues/{queueName}/retry:
 *   post:
 *     summary: Retry failed jobs in queue
 *     tags: [Queues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [blockchainRegistration, emailNotifications, certificateGeneration, pdfGeneration, analyticsProcessing]
 *         description: Name of the queue
 *     responses:
 *       200:
 *         description: Failed jobs retried successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Retried 5 failed jobs"
 *                 count:
 *                   type: integer
 *                   example: 5
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Queue not found
 *       500:
 *         description: Error retrying jobs
 */
router.post('/:queueName/retry', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super admin only'
      });
    }
    
    const { queueName } = req.params;
    const queue = await queueManager.getQueue(queueName);
    
    const failed = await queue.getFailed();
    const retryPromises = failed.map(job => job.retry());
    await Promise.all(retryPromises);
    
    ResponseFormatter.success(res, {
      message: `Retried ${failed.length} failed jobs`,
      count: failed.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/queues/{queueName}/pause:
 *   post:
 *     summary: Pause a queue
 *     tags: [Queues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the queue to pause
 *     responses:
 *       200:
 *         description: Queue paused successfully
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Queue not found
 */
router.post('/:queueName/pause', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super admin only'
      });
    }
    
    const { queueName } = req.params;
    const result = await queueManager.pauseQueue(queueName);
    
    ResponseFormatter.success(res, result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/queues/{queueName}/resume:
 *   post:
 *     summary: Resume a paused queue
 *     tags: [Queues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the queue to resume
 *     responses:
 *       200:
 *         description: Queue resumed successfully
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Queue not found
 */
router.post('/:queueName/resume', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super admin only'
      });
    }
    
    const { queueName } = req.params;
    const result = await queueManager.resumeQueue(queueName);
    
    ResponseFormatter.success(res, result);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/v1/queues/{queueName}/clear:
 *   post:
 *     summary: Clear jobs from a queue
 *     tags: [Queues]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *         description: Name of the queue to clear
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [completed, failed, delayed, active, wait, all]
 *           default: completed
 *         description: Type of jobs to clear
 *     responses:
 *       200:
 *         description: Queue cleared successfully
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Queue not found
 */
router.post('/:queueName/clear', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super admin only'
      });
    }
    
    const { queueName } = req.params;
    const { type = 'completed' } = req.query;
    
    const result = await queueManager.clearQueue(queueName, type);
    
    ResponseFormatter.success(res, result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;