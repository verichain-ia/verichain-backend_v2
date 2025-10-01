// src/api/v1/routes/certificates.js
const router = require('express').Router();
const ValidationMiddleware = require('../../../middleware/validation/validator');
const certificateSchemas = require('../../../middleware/validation/schemas/certificates.schema');
const paseoService = require('../../../services/blockchain/PaseoService');
const supabaseService = require('../../../services/supabaseService');
const supabaseAdmin = require('../../../services/supabaseAdmin');
const { protect } = require('../../../middleware/auth');
const crypto = require('crypto');
const { createLimiter, blockchainLimiter } = require('../../../middleware/rateLimiter');
const DatabaseTransaction = require('../../../utils/database/transactions');
const { AuthorizationError } = require('../../../errors');
const logger = require('../../../utils/logger');
const IdempotencyMiddleware = require('../../../middleware/idempotency');
const ResponseFormatter = require('../../../middleware/responseFormatter');
const CircuitBreakerFactory = require('../../../middleware/circuitBreaker');

/**
 * @swagger
 * components:
 *   schemas:
 *     Certificate:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique certificate identifier
 *           example: "UNIV-MG2NUJ3M78CE"
 *         organization_id:
 *           type: string
 *           format: uuid
 *         student_name:
 *           type: string
 *         student_email:
 *           type: string
 *           format: email
 *         student_id:
 *           type: string
 *         course_name:
 *           type: string
 *         course_code:
 *           type: string
 *         instructor_name:
 *           type: string
 *         issue_date:
 *           type: string
 *           format: date
 *         graduation_date:
 *           type: string
 *           format: date
 *         grade:
 *           type: string
 *         credits:
 *           type: integer
 *         blockchain_status:
 *           type: string
 *           enum: [pending, confirmed, failed]
 *         tx_hash:
 *           type: string
 *         block_number:
 *           type: integer
 *         smart_contract_address:
 *           type: string
 *         verification_count:
 *           type: integer
 *         created_by:
 *           type: string
 *           format: uuid
 *         metadata:
 *           type: object
 *         created_at:
 *           type: string
 *           format: date-time
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 * 
 * tags:
 *   - name: Certificates
 *     description: Certificate management and verification operations
 */

// Aplicar sanitización global a todas las rutas
router.use(ValidationMiddleware.sanitize());

// Middleware para validar datos de certificado
const validateCertificate = (req, res, next) => {
  const { student_name, course_name } = req.body;
  
  if (!student_name || !course_name) {
    return res.status(400).json({
      success: false,
      error: 'Student name and course name are required'
    });
  }
  
  // Validar formato de email si se proporciona
  if (req.body.student_email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.student_email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
  }
  
  // Validar créditos si se proporcionan
  if (req.body.credits && (isNaN(req.body.credits) || req.body.credits < 0)) {
    return res.status(400).json({
      success: false,
      error: 'Credits must be a positive number'
    });
  }
  
  next();
};

// Función para generar ID único con prefijo de organización
async function generateCertificateId(organizationId) {
  let prefix = 'CERT'; // Prefijo por defecto
  
  if (organizationId) {
    const { data: org } = await supabaseService.supabase
      .from('organizations')
      .select('certificate_prefix, name')
      .eq('id', organizationId)
      .single();
    
    if (org && org.certificate_prefix) {
      prefix = org.certificate_prefix;
    } else if (org && org.name) {
      // Generar prefijo automático si no está configurado
      const cleanName = org.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanName.length >= 3) {
        prefix = cleanName.substring(0, 4);
      }
    }
  }
  
  // Generar parte única del ID
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  
  // Asegurar que el ID total no exceda 20 caracteres
  const maxLength = 20;
  const separators = 2; // dos guiones
  const availableLength = maxLength - prefix.length - separators;
  
  // Distribuir el espacio disponible
  const timestampLength = Math.min(timestamp.length, Math.floor(availableLength * 0.6));
  const randomLength = Math.min(random.length, availableLength - timestampLength);
  
  const id = `${prefix}-${timestamp.substring(0, timestampLength)}${random.substring(0, randomLength)}`;
  
  return id.substring(0, 20); // Garantizar máximo 20 caracteres
}
/**
 * @swagger
 * /api/v1/certificates:
 *   post:
 *     summary: Create a new certificate
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - student_name
 *               - course_name
 *             properties:
 *               student_name:
 *                 type: string
 *                 description: Full name of the student
 *                 example: "John Doe"
 *               student_email:
 *                 type: string
 *                 format: email
 *                 example: "john@example.com"
 *               student_id:
 *                 type: string
 *                 example: "STD-2024-001"
 *               course_name:
 *                 type: string
 *                 example: "Advanced Web Development"
 *               course_code:
 *                 type: string
 *                 example: "CS-401"
 *               instructor_name:
 *                 type: string
 *                 example: "Dr. Jane Smith"
 *               graduation_date:
 *                 type: string
 *                 format: date
 *               grade:
 *                 type: string
 *                 example: "A+"
 *               credits:
 *                 type: integer
 *                 example: 4
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Certificate created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */

router.post('/', 
  protect,
  IdempotencyMiddleware.check, 
  createLimiter,
  ValidationMiddleware.validateBody(certificateSchemas.create),
  validateCertificate,
  async (req, res, next) => {
    const transaction = new DatabaseTransaction(supabaseAdmin.client);
    
    try {
      const {
        student_name,
        student_email,
        student_id,
        course_name,
        course_code,
        instructor_name,
        graduation_date,
        grade,
        credits,
        metadata
      } = req.body;

      const userOrgId = req.user.organization_id;
      const userId = req.user.id;

      // Validar permisos - USAR THROW para el error handler
      if (!userOrgId && req.user.role !== 'super_admin') {
        throw new AuthorizationError('User must belong to an organization to issue certificates');
      }

      const allowedRoles = ['super_admin', 'org_admin', 'issuer'];
      if (!allowedRoles.includes(req.user.role)) {
        throw new AuthorizationError('Insufficient permissions to issue certificates');
      }

      // Generar ID con prefijo
      const id = await generateCertificateId(userOrgId);

      // Verificar unicidad del ID
      const { data: existing } = await supabaseService.supabase
        .from('certificates')
        .select('id')
        .eq('id', id)
        .single();
      
      if (existing) {
        id = `${id}${crypto.randomBytes(1).toString('hex').toUpperCase()}`.substring(0, 20);
      }

      // Preparar datos
      const certificateData = {
        id,
        organization_id: userOrgId || null,
        student_name: student_name.trim(),
        student_email: student_email ? student_email.toLowerCase().trim() : null,
        student_id: student_id ? student_id.trim() : null,
        course_name: course_name.trim(),
        course_code: course_code ? course_code.trim().toUpperCase() : null,
        instructor_name: instructor_name ? instructor_name.trim() : null,
        issue_date: new Date().toISOString().split('T')[0],
        graduation_date: graduation_date || null,
        grade: grade ? grade.toUpperCase() : null,
        credits: credits ? parseInt(credits) : null,
        blockchain_status: 'pending',
        smart_contract_address: process.env.CONTRACT_ADDRESS || '0x96950629523b239C2B0d6dd029300dDAe19Be2Cc',
        verification_count: 0,
        created_by: userId,
        metadata: metadata || {},
        created_at: new Date().toISOString()
      };

      // TRANSACCIÓN ATÓMICA - Todo o nada
      transaction
        .add('certificates', 'insert', certificateData)
        .add('activity_logs', 'insert', {
          id: crypto.randomUUID(),
          user_id: userId,
          action: 'certificate_created',
          resource_type: 'certificate',
          resource_id: id,
          details: { 
            student_name, 
            course_name,
            organization_id: userOrgId 
          },
          created_at: new Date().toISOString()
        });

      // Ejecutar transacción
      const result = await transaction.execute();
      
      // Obtener certificado con relaciones
      const { data: certificate } = await supabaseService.supabase
        .from('certificates')
        .select(`
          *,
          organizations (
            name,
            certificate_prefix
          )
        `)
        .eq('id', id)
        .single();

      logger.info(`Certificate ${id} created by user ${userId}`);

      ResponseFormatter.created(
        res, 
        certificate || result.data[0],
        'Certificate created successfully'
      );
      
    } catch (error) {
      // El error handler centralizado se encarga
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/v1/certificates:
 *   get:
 *     summary: List all certificates with filters and pagination
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, failed]
 *         description: Filter by blockchain status
 *       - in: query
 *         name: organization_id
 *         schema:
 *           type: string
 *         description: Filter by organization ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in student name, email, course name, or certificate ID
 *       - in: query
 *         name: from_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter certificates issued after this date
 *       - in: query
 *         name: to_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter certificates issued before this date
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [created_at, issue_date, student_name, course_name, blockchain_status]
 *           default: created_at
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: List of certificates with pagination info
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
 *                     $ref: '#/components/schemas/Certificate'
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     confirmed:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *                     has_next:
 *                       type: boolean
 *                     has_prev:
 *                       type: boolean
 */

// GET todos con filtros avanzados y paginación
router.get('/',
  protect,
  ValidationMiddleware.validateQuery(certificateSchemas.query),
  async (req, res) => {
    try {
      // Usar los parámetros validados o los originales
      const validatedQuery = req.validatedQuery || req.query;
      const { 
        page = 1, 
        limit = 20, 
        status,
        organization_id,
        search,
        from_date,
        to_date,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = validatedQuery;  // Cambié de 'query' a 'validatedQuery'
      
      const offset = (page - 1) * limit;

      // Query base con joins
      let query = supabaseService.supabase  // Ahora esta variable no colisiona
        .from('certificates')
        .select(`
          *,
          organizations (
            id,
            name,
            certificate_prefix
          ),
          users!created_by (
            id,
            full_name,
            email
          )
        `, { count: 'exact' });

    // Aplicar restricciones según rol
    if (req.user.role === 'student') {
      // Estudiantes solo ven sus propios certificados
      query = query.eq('student_email', req.user.email);
    } else if (req.user.role !== 'super_admin') {
      // Usuarios de organización solo ven certificados de su org
      if (req.user.organization_id) {
        query = query.eq('organization_id', req.user.organization_id);
      } else {
        query = query.eq('created_by', req.user.id);
      }
    }

    // Filtros opcionales
    if (status) {
      query = query.eq('blockchain_status', status);
    }
    
    if (organization_id && req.user.role === 'super_admin') {
      query = query.eq('organization_id', organization_id);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      query = query.or(
        `student_name.ilike.${searchTerm},` +
        `student_email.ilike.${searchTerm},` +
        `course_name.ilike.${searchTerm},` +
        `id.ilike.${searchTerm},` +
        `student_id.ilike.${searchTerm}`
      );
    }

    if (from_date) {
      query = query.gte('issue_date', from_date);
    }

    if (to_date) {
      query = query.lte('issue_date', to_date);
    }

    // Validar campos de ordenamiento
    const allowedSortFields = ['created_at', 'issue_date', 'student_name', 'course_name', 'blockchain_status'];
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortAscending = sort_order === 'asc';

    // Ejecutar query
    const { data, error, count } = await query
      .range(offset, offset + limit - 1)
      .order(sortField, { ascending: sortAscending });
    
    if (error) throw error;

    // Calcular estadísticas
    const stats = {
      total: count,
      confirmed: data?.filter(c => c.blockchain_status === 'confirmed').length || 0,
      pending: data?.filter(c => c.blockchain_status === 'pending').length || 0,
      failed: data?.filter(c => c.blockchain_status === 'failed').length || 0
    };

    res.json({ 
      success: true, 
      data,
      stats,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
        has_next: page < Math.ceil(count / limit),
        has_prev: page > 1
      }
    });
  } catch (error) {
    console.error('List certificates error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to retrieve certificates'
    });
  }
});

/**
 * @swagger
 * /api/v1/certificates/{id}:
 *   get:
 *     summary: Get a certificate by ID
 *     tags: [Certificates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID
 *         example: "UNIV-MG2NUJ3M78CE"
 *     responses:
 *       200:
 *         description: Certificate details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Certificate'
 *       404:
 *         description: Certificate not found
 */

// GET por ID (PÚBLICO para verificación)
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseService.supabase
      .from('certificates')
      .select(`
        *,
        organizations (
          id,
          name,
          email,
          website,
          certificate_prefix
        )
      `)
      .eq('id', req.params.id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          success: false, 
          error: 'Certificate not found' 
        });
      }
      throw error;
    }

    res.json({ 
      success: true, 
      data 
    });
  } catch (error) {
    console.error('Get certificate error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to retrieve certificate'
    });
  }
});

/**
 * @swagger
 * /api/v1/certificates/{id}/register-blockchain:
 *   post:
 *     summary: Register certificate on blockchain
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID to register
 *     responses:
 *       200:
 *         description: Certificate registered on blockchain
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     certificate_id:
 *                       type: string
 *                     tx_hash:
 *                       type: string
 *                     block_number:
 *                       type: integer
 *                     certificate_hash:
 *                       type: string
 *                     explorer_url:
 *                       type: string
 *       400:
 *         description: Certificate already registered
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Certificate not found
 *       500:
 *         description: Blockchain registration failed
 */

// REGISTRAR EN BLOCKCHAIN (PROTEGIDO)
router.post('/:id/register-blockchain',
  protect,
  blockchainLimiter,
  async (req, res) => {
  try {
    // Verificar permisos
    const allowedRoles = ['super_admin', 'org_admin', 'issuer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions to register certificates on blockchain'
      });
    }

    // Obtener certificado con información completa
    const { data: cert, error } = await supabaseService.supabase
      .from('certificates')
      .select(`
        *,
        organizations (
          name,
          certificate_prefix
        )
      `)
      .eq('id', req.params.id)
      .single();
    
    if (error || !cert) {
      return res.status(404).json({ 
        success: false, 
        error: 'Certificate not found' 
      });
    }

    // Verificar permisos de organización
    if (req.user.role !== 'super_admin' && cert.organization_id !== req.user.organization_id) {
      return res.status(403).json({
        success: false,
        error: 'Cannot register certificates from other organizations'
      });
    }

    // Verificar si ya está registrado
    if (cert.tx_hash) {
      return res.status(400).json({ 
        success: false, 
        error: 'Certificate already registered on blockchain',
        data: {
          tx_hash: cert.tx_hash,
          block_number: cert.block_number,
          explorer_url: `https://paseo.subscan.io/extrinsic/${cert.tx_hash}`
        }
      });
    }

    // Crear hash determinístico del certificado
    const certificateContent = {
      id: cert.id,
      student_name: cert.student_name,
      student_email: cert.student_email,
      student_id: cert.student_id,
      course_name: cert.course_name,
      course_code: cert.course_code,
      instructor_name: cert.instructor_name,
      issue_date: cert.issue_date,
      grade: cert.grade,
      credits: cert.credits,
      organization: cert.organizations?.name
    };
    
    const certificateHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(certificateContent))
      .digest('hex');

    // Preparar datos para blockchain
    const blockchainData = {
      id: cert.id,
      recipient: cert.student_name,
      recipientEmail: cert.student_email || '',
      issuer: cert.organizations?.name || 'VeriChain',
      course: cert.course_name,
      issueDate: cert.issue_date,
      hash: certificateHash
    };

    // Registrar en Paseo
    console.log('Registering certificate on blockchain:', cert.id);
    const blockchainResult = await paseoService.registerCertificate(blockchainData);

    if (!blockchainResult || !blockchainResult.txHash) {
      throw new Error('Blockchain registration failed - no transaction hash received');
    }

    // Actualizar en base de datos
    const { error: updateError } = await supabaseAdmin.client
      .from('certificates')
      .update({
        tx_hash: blockchainResult.txHash,
        block_number: blockchainResult.blockNumber || null,
        blockchain_status: 'confirmed',
        metadata: {
          ...cert.metadata,
          certificate_hash: certificateHash,
          blockchain_registered_at: new Date().toISOString(),
          registered_by: req.user.id
        }
      })
      .eq('id', req.params.id);

    if (updateError) {
      console.error('Failed to update certificate after blockchain registration:', updateError);
      // No lanzar error aquí porque la transacción blockchain ya se completó
    }

    // Registrar actividad
    await supabaseService.supabase
      .from('activity_logs')
      .insert({
        user_id: req.user.id,
        action: 'certificate_blockchain_registered',
        resource_type: 'certificate',
        resource_id: cert.id,
        details: {
          tx_hash: blockchainResult.txHash,
          block_number: blockchainResult.blockNumber
        },
        created_at: new Date().toISOString()
      });

    res.json({
      success: true,
      message: 'Certificate successfully registered on blockchain',
      data: {
        certificate_id: cert.id,
        tx_hash: blockchainResult.txHash,
        block_number: blockchainResult.blockNumber,
        certificate_hash: certificateHash,
        explorer_url: `https://paseo.subscan.io/extrinsic/${blockchainResult.txHash}`
      }
    });
  } catch (error) {
    console.error('Blockchain registration error:', error);
    
    // Actualizar estado a failed
    await supabaseAdmin.client
      .from('certificates')
      .update({
        blockchain_status: 'failed',
        metadata: {
          ...cert?.metadata,
          blockchain_error: error.message,
          failed_at: new Date().toISOString()
        }
      })
      .eq('id', req.params.id);

    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to register certificate on blockchain'
    });
  }
});

/**
 * @swagger
 * /api/v1/certificates/{id}/verify:
 *   get:
 *     summary: Verify a certificate
 *     tags: [Certificates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID to verify
 *     responses:
 *       200:
 *         description: Certificate verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 verified:
 *                   type: boolean
 *                 verification_id:
 *                   type: string
 *                 certificate:
 *                   type: object
 *                 organization:
 *                   type: object
 *                 blockchain:
 *                   type: object
 *                   properties:
 *                     verified:
 *                       type: boolean
 *                     tx_hash:
 *                       type: string
 *                     block_number:
 *                       type: integer
 *                     explorer_url:
 *                       type: string
 *                 integrity:
 *                   type: object
 *                   properties:
 *                     hash:
 *                       type: string
 *                     verified:
 *                       type: boolean
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     total_verifications:
 *                       type: integer
 *                     issued_date:
 *                       type: string
 *       404:
 *         description: Certificate not found
 */

// VERIFICAR certificado (PÚBLICO)
router.get('/:id/verify', async (req, res) => {
  try {
    const { data: cert, error } = await supabaseService.supabase
      .from('certificates')
      .select(`
        *,
        organizations (
          name,
          email,
          website,
          certificate_prefix
        )
      `)
      .eq('id', req.params.id)
      .single();
    
    if (error || !cert) {
      return res.status(404).json({ 
        success: false, 
        verified: false,
        message: 'Certificate not found'
      });
    }

    // Incrementar contador de verificaciones
    await supabaseAdmin.client
      .from('certificates')
      .update({ 
        verification_count: (cert.verification_count || 0) + 1
      })
      .eq('id', req.params.id);

    // Registrar verificación detallada
    const verificationRecord = {
      certificate_id: req.params.id,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'],
      referrer: req.headers['referer'] || null,
      created_at: new Date().toISOString()
    };

    await supabaseAdmin.client
      .from('verifications')
      .insert(verificationRecord);

    // Verificar integridad del certificado
    const certificateContent = {
      id: cert.id,
      student_name: cert.student_name,
      student_email: cert.student_email,
      student_id: cert.student_id,
      course_name: cert.course_name,
      course_code: cert.course_code,
      instructor_name: cert.instructor_name,
      issue_date: cert.issue_date,
      grade: cert.grade,
      credits: cert.credits,
      organization: cert.organizations?.name
    };
    
    const currentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(certificateContent))
      .digest('hex');

    // Verificar en blockchain si está registrado
    let blockchainVerification = null;
    if (cert.tx_hash) {
      try {
        blockchainVerification = {
          verified: true,
          tx_hash: cert.tx_hash,
          block_number: cert.block_number,
          explorer_url: `https://paseo.subscan.io/extrinsic/${cert.tx_hash}`
        };
      } catch (error) {
        console.error('Blockchain verification error:', error);
        blockchainVerification = {
          verified: false,
          error: 'Could not verify blockchain status'
        };
      }
    }

    res.json({
      success: true,
      verified: true,
      verification_id: crypto.randomBytes(16).toString('hex'),
      certificate: {
        id: cert.id,
        student_name: cert.student_name,
        student_email: cert.student_email,
        student_id: cert.student_id,
        course_name: cert.course_name,
        course_code: cert.course_code,
        instructor_name: cert.instructor_name,
        issue_date: cert.issue_date,
        graduation_date: cert.graduation_date,
        grade: cert.grade,
        credits: cert.credits
      },
      organization: {
        name: cert.organizations?.name,
        email: cert.organizations?.email,
        website: cert.organizations?.website
      },
      blockchain: blockchainVerification || {
        verified: false,
        status: cert.blockchain_status,
        message: 'Certificate not yet registered on blockchain'
      },
      integrity: {
        hash: currentHash,
        verified: true
      },
      statistics: {
        total_verifications: cert.verification_count + 1,
        issued_date: cert.created_at
      }
    });
  } catch (error) {
    console.error('Verify certificate error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Verification failed'
    });
  }
});

/**
 * @swagger
 * /api/v1/certificates/{id}:
 *   put:
 *     summary: Update a certificate
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               student_name:
 *                 type: string
 *               student_email:
 *                 type: string
 *               course_name:
 *                 type: string
 *               instructor_name:
 *                 type: string
 *               grade:
 *                 type: string
 *               credits:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Certificate updated successfully
 *       400:
 *         description: Cannot modify blockchain-registered certificate
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Certificate not found
 */

// UPDATE certificado (PROTEGIDO)
router.put('/:id',
  protect,
  ValidationMiddleware.validateId(),
  ValidationMiddleware.validateBody(certificateSchemas.update),
  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Campos que no se pueden actualizar
    const immutableFields = [
      'id', 'tx_hash', 'block_number', 'blockchain_status',
      'created_by', 'created_at', 'verification_count'
    ];
    
    immutableFields.forEach(field => delete updates[field]);

    // Obtener certificado actual
    const { data: cert } = await supabaseService.supabase
      .from('certificates')
      .select('organization_id, blockchain_status')
      .eq('id', id)
      .single();

    if (!cert) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found'
      });
    }

    // No permitir editar si está en blockchain
    if (cert.blockchain_status === 'confirmed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot modify certificate that is already registered on blockchain'
      });
    }

    // Verificar permisos
    if (req.user.role !== 'super_admin') {
      if (cert.organization_id !== req.user.organization_id) {
        return res.status(403).json({
          success: false,
          error: 'Insufficient permissions to modify this certificate'
        });
      }
    }

    // Sanitizar datos de entrada
    if (updates.student_email) {
      updates.student_email = updates.student_email.toLowerCase().trim();
    }
    if (updates.grade) {
      updates.grade = updates.grade.toUpperCase();
    }
    if (updates.credits) {
      updates.credits = parseInt(updates.credits);
    }

    // Actualizar certificado
    const { data, error } = await supabaseAdmin.client
      .from('certificates')
      .update({
        ...updates,
        metadata: {
          ...cert.metadata,
          ...updates.metadata,
          last_updated_at: new Date().toISOString(),
          updated_by: req.user.id
        }
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Registrar actividad
    await supabaseService.supabase
      .from('activity_logs')
      .insert({
        user_id: req.user.id,
        action: 'certificate_updated',
        resource_type: 'certificate',
        resource_id: id,
        details: { updates },
        created_at: new Date().toISOString()
      });

    res.json({
      success: true,
      data,
      message: 'Certificate updated successfully'
    });
  } catch (error) {
    console.error('Update certificate error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update certificate'
    });
  }
});
/**
 * @swagger
 * /api/v1/certificates/{id}:
 *   delete:
 *     summary: Delete a certificate
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate ID to delete
 *     responses:
 *       200:
 *         description: Certificate deleted successfully
 *       400:
 *         description: Cannot delete blockchain-registered certificate
 *       403:
 *         description: Only super admin can delete
 *       404:
 *         description: Certificate not found
 */


// DELETE certificado (PROTEGIDO)
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    // Solo super_admin puede eliminar
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super administrators can delete certificates'
      });
    }

    // Obtener certificado
    const { data: cert } = await supabaseService.supabase
      .from('certificates')
      .select('blockchain_status')
      .eq('id', id)
      .single();

    if (!cert) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found'
      });
    }

    // No permitir eliminar si está en blockchain
    if (cert.blockchain_status === 'confirmed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete certificate that is registered on blockchain. This would compromise the integrity of the system.'
      });
    }

    // Eliminar verificaciones asociadas primero
    await supabaseAdmin.client
      .from('verifications')
      .delete()
      .eq('certificate_id', id);

    // Eliminar certificado
    const { error } = await supabaseAdmin.client
      .from('certificates')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Registrar actividad
    await supabaseService.supabase
      .from('activity_logs')
      .insert({
        user_id: req.user.id,
        action: 'certificate_deleted',
        resource_type: 'certificate',
        resource_id: id,
        details: { deleted_at: new Date().toISOString() },
        created_at: new Date().toISOString()
      });

    res.json({
      success: true,
      message: 'Certificate and related records deleted successfully'
    });
  } catch (error) {
    console.error('Delete certificate error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete certificate'
    });
  }
});

/**
 * @swagger
 * /api/v1/certificates/batch/register-blockchain:
 *   post:
 *     summary: Register multiple certificates on blockchain
 *     tags: [Certificates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - certificate_ids
 *             properties:
 *               certificate_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of certificate IDs (max 10)
 *                 example: ["CERT-001", "CERT-002", "CERT-003"]
 *     responses:
 *       200:
 *         description: Batch registration results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       certificate_id:
 *                         type: string
 *                       status:
 *                         type: string
 *                       tx_hash:
 *                         type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       certificate_id:
 *                         type: string
 *                       status:
 *                         type: string
 *                       error:
 *                         type: string
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Insufficient permissions
 */

// BATCH - Registrar múltiples certificados en blockchain (PROTEGIDO)
router.post('/batch/register-blockchain', protect, async (req, res) => {
  try {
    // Solo admin puede hacer registro batch
    if (!['super_admin', 'org_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions for batch operations'
      });
    }

    const { certificate_ids } = req.body;

    if (!Array.isArray(certificate_ids) || certificate_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of certificate IDs'
      });
    }

    if (certificate_ids.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 certificates can be registered at once'
      });
    }

    const results = [];
    const errors = [];

    for (const certId of certificate_ids) {
      try {
        // Reutilizar la lógica del endpoint individual
        const response = await fetch(`http://localhost:${process.env.PORT || 4000}/api/v1/certificates/${certId}/register-blockchain`, {
          method: 'POST',
          headers: {
            'Authorization': req.headers.authorization,
            'Content-Type': 'application/json'
          }
        });

        const result = await response.json();
        
        if (result.success) {
          results.push({
            certificate_id: certId,
            status: 'success',
            tx_hash: result.data.tx_hash
          });
        } else {
          errors.push({
            certificate_id: certId,
            status: 'failed',
            error: result.error
          });
        }
      } catch (error) {
        errors.push({
          certificate_id: certId,
          status: 'failed',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Batch registration completed: ${results.length} successful, ${errors.length} failed`,
      results,
      errors
    });
  } catch (error) {
    console.error('Batch registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Batch registration failed'
    });
  }
});

module.exports = router;