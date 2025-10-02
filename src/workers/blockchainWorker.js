const QueueManager = require('../queues/queueConfig');
const paseoService = require('../services/blockchain/PaseoService');
const supabaseAdmin = require('../services/supabaseAdmin');
const logger = require('../utils/logger');

class BlockchainWorker {
  async start() {
    const queueManager = QueueManager.getInstance();
    const queue = await queueManager.getQueue('blockchainRegistration');
    
    queue.process('register-certificate', async (job) => {
      const { certificateId, retryCount = 0 } = job.data;
      
      try {
        logger.info(`Processing blockchain registration for ${certificateId}`);
        
        // Obtener certificado
        const { data: cert, error } = await supabaseAdmin.client
          .from('certificates')
          .select('*')
          .eq('id', certificateId)
          .single();
          
        if (error || !cert) {
          throw new Error(`Certificate ${certificateId} not found`);
        }
        
        if (cert.tx_hash) {
          logger.warn(`Certificate ${certificateId} already registered`);
          return { status: 'already_registered', tx_hash: cert.tx_hash };
        }
        
        // Registrar en blockchain
        const result = await paseoService.registerCertificate(cert);
        
        // Actualizar en DB
        await supabaseAdmin.client
          .from('certificates')
          .update({
            tx_hash: result.txHash,
            block_number: result.blockNumber,
            blockchain_status: 'confirmed',
            metadata: {
              ...cert.metadata,
              blockchain_registered_at: new Date().toISOString(),
              retry_count: retryCount
            }
          })
          .eq('id', certificateId);
        
        logger.info(`Certificate ${certificateId} registered: ${result.txHash}`);
        
        // Notificar por email (agregar a queue de email)
        await queueManager.addJob('emailNotifications', {
          type: 'certificate_registered',
          to: cert.student_email,
          certificateId: certificateId,
          txHash: result.txHash
        });
        
        return {
          status: 'success',
          certificateId,
          txHash: result.txHash,
          blockNumber: result.blockNumber
        };
        
      } catch (error) {
        logger.error(`Blockchain registration failed for ${certificateId}:`, error);
        
        // Actualizar estado de error
        await supabaseAdmin.client
          .from('certificates')
          .update({
            blockchain_status: 'failed',
            metadata: {
              ...cert?.metadata,
              last_error: error.message,
              failed_at: new Date().toISOString(),
              retry_count: retryCount
            }
          })
          .eq('id', certificateId);
        
        throw error; // Re-throw para que Bull maneje los reintentos
      }
    });
    
    logger.info('Blockchain worker started');
  }
  
  async stop() {
    const queueManager = QueueManager.getInstance();
    const queue = await queueManager.getQueue('blockchainRegistration');
    await queue.close();
    logger.info('Blockchain worker stopped');
  }
}

module.exports = new BlockchainWorker();