const { supabase } = require('../services/supabaseService');
const blockchainService = require('../services/blockchainService');
const webhookService = require('../services/webhookService');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { validateCertificate } = require('../validators/certificateValidator');

class CertificatesController {
  /**
   * Create a new certificate
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next middleware
   */
  async createCertificate(req, res, next) {
    try {
      // Validate input
      const { error, value } = validateCertificate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400);
      }

      // Create certificate in database
      const { data: certificate, error: dbError } = await supabase
        .from('certificates')
        .insert({
          ...value,
          organization_id: req.user.organization_id,
          created_by: req.user.id
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Register on blockchain if requested
      if (value.register_blockchain) {
        try {
          const blockchainHash = await blockchainService.registerCertificate(certificate);
          
          // Update certificate with blockchain hash
          const { data: updatedCert } = await supabase
            .from('certificates')
            .update({ blockchain_hash: blockchainHash })
            .eq('id', certificate.id)
            .select()
            .single();
          
          certificate.blockchain_hash = blockchainHash;
        } catch (blockchainError) {
          logger.error('Blockchain registration failed:', blockchainError);
          // Continue without blockchain - don't fail the whole operation
        }
      }

      // Trigger webhook asynchronously
      if (webhookService && webhookService.triggerCertificateEvent) {
        webhookService.triggerCertificateEvent('certificate.created', certificate)
          .catch(err => logger.error('Webhook trigger failed:', err));
      }

      // Send response
      res.status(201).json({
        success: true,
        data: certificate,
        message: 'Certificate created successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all certificates with pagination
   */
  async getCertificates(req, res, next) {
    try {
      const { page = 1, limit = 10, search } = req.query;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('certificates')
        .select('*', { count: 'exact' });

      // Add search if provided
      if (search) {
        query = query.or(`title.ilike.%${search}%,recipient_name.ilike.%${search}%`);
      }

      // Add organization filter
      if (req.user.organization_id) {
        query = query.eq('organization_id', req.user.organization_id);
      }

      // Execute query with pagination
      const { data: certificates, count, error } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      res.json({
        success: true,
        data: certificates,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get certificate by ID
   */
  async getCertificateById(req, res, next) {
    try {
      const { id } = req.params;

      const { data: certificate, error } = await supabase
        .from('certificates')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !certificate) {
        throw new AppError('Certificate not found', 404);
      }

      res.json({
        success: true,
        data: certificate
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update certificate
   */
  async updateCertificate(req, res, next) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const { data: certificate, error } = await supabase
        .from('certificates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error || !certificate) {
        throw new AppError('Certificate not found', 404);
      }

      // Trigger webhook
      if (webhookService && webhookService.triggerCertificateEvent) {
        webhookService.triggerCertificateEvent('certificate.updated', certificate)
          .catch(err => logger.error('Webhook trigger failed:', err));
      }

      res.json({
        success: true,
        data: certificate,
        message: 'Certificate updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete certificate
   */
  async deleteCertificate(req, res, next) {
    try {
      const { id } = req.params;

      const { error } = await supabase
        .from('certificates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      res.json({
        success: true,
        message: 'Certificate deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Verify certificate
   */
  async verifyCertificate(req, res, next) {
    try {
      const { id } = req.params;

      const { data: certificate, error } = await supabase
        .from('certificates')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !certificate) {
        throw new AppError('Certificate not found', 404);
      }

      // Verify on blockchain if hash exists
      let blockchainValid = false;
      if (certificate.blockchain_hash) {
        blockchainValid = await blockchainService.verifyCertificate(
          certificate.id,
          certificate.blockchain_hash
        );
      }

      // Trigger webhook
      if (webhookService && webhookService.triggerCertificateEvent) {
        webhookService.triggerCertificateEvent('certificate.verified', {
          ...certificate,
          verification: { blockchainValid }
        }).catch(err => logger.error('Webhook trigger failed:', err));
      }

      res.json({
        success: true,
        data: {
          certificate,
          verification: {
            valid: true,
            blockchainValid,
            verifiedAt: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CertificatesController();