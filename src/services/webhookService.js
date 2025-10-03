const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const supabaseAdmin = require('./supabaseAdmin');

class WebhookService {
  constructor() {
    this.retryAttempts = 3;
    this.retryDelay = 1000; // ms
  }

  /**
   * Generate webhook signature
   */
  generateSignature(payload, secret) {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  /**
   * Send webhook with retry logic
   */
  async send(url, event, data, secret = null, organizationId = null) {
    const payload = {
      event,
      data,
      timestamp: new Date().toISOString(),
      organizationId
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
      'X-Webhook-Timestamp': payload.timestamp
    };

    if (secret) {
      headers['X-Webhook-Signature'] = this.generateSignature(payload, secret);
    }

    let attempt = 0;
    let lastError = null;

    while (attempt < this.retryAttempts) {
      try {
        const response = await axios.post(url, payload, {
          headers,
          timeout: 5000
        });

        // Log successful webhook
        await this.logWebhook({
          url,
          event,
          organizationId,
          status: 'delivered',
          statusCode: response.status,
          attempt: attempt + 1
        });

        logger.info(`Webhook delivered: ${event} to ${url}`);
        return response;

      } catch (error) {
        lastError = error;
        attempt++;
        
        logger.warn(`Webhook attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < this.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }

    // Log failed webhook
    await this.logWebhook({
      url,
      event,
      organizationId,
      status: 'failed',
      error: lastError.message,
      attempt: attempt
    });

    throw lastError;
  }

  /**
   * Log webhook delivery
   */
  async logWebhook(data) {
    try {
      await supabaseAdmin.client
        .from('webhook_logs')
        .insert({
          ...data,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      logger.error('Failed to log webhook:', error);
    }
  }

  /**
   * Get webhook configuration for organization
   */
  async getOrgWebhookConfig(organizationId) {
    const { data, error } = await supabaseAdmin.client
      .from('webhook_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('enabled', true)
      .single();

    if (error) {
      logger.error('Failed to get webhook config:', error);
      return null;
    }

    return data;
  }

  /**
   * Trigger webhook for certificate events
   */
  async triggerCertificateEvent(event, certificate) {
    try {
      const config = await this.getOrgWebhookConfig(certificate.organization_id);
      
      if (!config || !config.events.includes(event)) {
        return;
      }

      await this.send(
        config.url,
        event,
        certificate,
        config.secret,
        certificate.organization_id
      );
    } catch (error) {
      logger.error(`Failed to trigger webhook for ${event}:`, error);
    }
  }
}

module.exports = new WebhookService();
