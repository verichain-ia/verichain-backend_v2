const router = require('express').Router();
const supabaseService = require('../../../services/supabaseService');

/**
 * @swagger
 * tags:
 *   name: Organizations
 *   description: Organization management endpoints
 */

/**
 * @swagger
 * /organizations:
 *   get:
 *     summary: List all organizations
 *     tags: [Organizations]
 *     responses:
 *       200:
 *         description: Successfully retrieved organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *       500:
 *         description: Internal server error
 */
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseService.supabase
      .from('organizations')
      .select('*')
      .order('name');
    
    if (error) {
      console.error('Organizations query error:', error);
      throw error;
    }
    
    res.json({
      success: true,
      data: data || []
    });
    
  } catch (error) {
    console.error('Error retrieving organizations:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error retrieving organizations'
    });
  }
});

module.exports = router;