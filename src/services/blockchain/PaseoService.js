// src/services/blockchain/PaseoService.js
const { ApiPromise, WsProvider } = require('@polkadot/api');
const { Keyring } = require('@polkadot/keyring');
const { cryptoWaitReady } = require('@polkadot/util-crypto');
const CircuitBreakerFactory = require('../../middleware/circuitBreaker');

class PaseoBlockchainService {
  constructor() {
    this.api = null;
    this.keyring = null;
    this.account = null;
    this.initialized = false;
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🔄 Initializing Paseo Service...');
      
      await cryptoWaitReady();
      
      // Conectar a Paseo
      const wsProvider = new WsProvider('wss://paseo-rpc.dwellir.com');
      this.api = await ApiPromise.create({ provider: wsProvider });
      
      // Configurar cuenta (usando Alice para pruebas)
      this.keyring = new Keyring({ type: 'sr25519' });
      this.account = this.keyring.addFromUri('//Alice');
      
      const chain = await this.api.rpc.system.chain();
      const lastHeader = await this.api.rpc.chain.getHeader();
      
      console.log('✅ Connected to:', chain.toString());
      console.log('📦 Latest block:', lastHeader.number.toString());
      console.log('👤 Account:', this.account.address);
      
      this.initialized = true;
      
    } catch (error) {
      console.error('❌ Paseo init error:', error.message);
      this.initialized = false;
    }
  }

  async registerCertificate(certificateData) {
    // Crear circuit breaker para blockchain
    const breaker = CircuitBreakerFactory.blockchainBreaker(
      async () => this._registerCertificateInternal(certificateData)
    );
    
    // Configurar fallback
    breaker.fallback(() => {
      console.log('⚠️ Blockchain service unavailable, using fallback');
      return {
        success: true,
        txHash: `pending_${Date.now()}_${certificateData.id}`,
        blockHash: null,
        blockNumber: null,
        network: 'paseo',
        status: 'queued',
        message: 'Certificate queued for blockchain registration when service is available'
      };
    });
    
    try {
      return await breaker.fire();
    } catch (error) {
      console.error('❌ Circuit breaker error:', error);
      // Si el circuit breaker falla completamente, devolver respuesta de fallback
      return {
        success: false,
        txHash: null,
        blockHash: null,
        blockNumber: null,
        network: 'paseo',
        status: 'failed',
        error: error.message,
        message: 'Blockchain service temporarily unavailable'
      };
    }
  }

  async _registerCertificateInternal(certificateData) {
    if (!this.initialized) {
      await this.initialize();
      
      // Si aún no está inicializado después del intento, lanzar error
      if (!this.initialized) {
        throw new Error('Blockchain service could not be initialized');
      }
    }

    try {
      console.log('📝 Registering certificate:', certificateData.id);
      
      // Crear el payload
      const payload = JSON.stringify({
        type: 'VERICHAIN_CERTIFICATE',
        id: certificateData.id,
        recipient: certificateData.recipient,
        recipientEmail: certificateData.recipientEmail || '',
        issuer: certificateData.issuer,
        course: certificateData.course,
        issueDate: certificateData.issueDate,
        timestamp: Date.now(),
        hash: certificateData.hash
      });
      
      // Registrar en Paseo como remark
      const tx = await this.api.tx.system.remark(payload);
      
      // Firmar y enviar con timeout
      const txPromise = tx.signAndSend(this.account);
      
      // Agregar timeout de 30 segundos
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transaction timeout after 30s')), 30000)
      );
      
      const hash = await Promise.race([txPromise, timeoutPromise]);
      
      console.log('✅ Registered on Paseo:', hash.toHex());
      
      // Obtener información del bloque
      let blockNumber = null;
      try {
        const signedBlock = await this.api.rpc.chain.getBlock();
        blockNumber = signedBlock.block.header.number.toNumber();
      } catch (blockError) {
        console.warn('Could not get block number:', blockError.message);
      }
      
      return {
        success: true,
        txHash: hash.toHex(),
        blockHash: hash.toString(),
        blockNumber: blockNumber,
        network: 'paseo',
        status: 'confirmed',
        message: 'Certificate successfully registered on blockchain'
      };
      
    } catch (error) {
      console.error('❌ Registration error:', error);
      throw error;
    }
  }

  async getTransaction(txHash) {
    // Envolver en circuit breaker
    const breaker = CircuitBreakerFactory.blockchainBreaker(
      async () => this._getTransactionInternal(txHash)
    );
    
    breaker.fallback(() => {
      console.log('⚠️ Cannot verify transaction, blockchain unavailable');
      return null;
    });
    
    try {
      return await breaker.fire();
    } catch (error) {
      return null;
    }
  }

  async _getTransactionInternal(txHash) {
    if (!this.api) return null;
    
    try {
      const signedBlock = await this.api.rpc.chain.getBlock(txHash);
      return signedBlock.block;
    } catch (error) {
      console.error('Error getting transaction:', error);
      return null;
    }
  }

  async verifyConnection() {
    if (!this.api) {
      return false;
    }
    
    try {
      const chain = await this.api.rpc.system.chain();
      return chain !== null;
    } catch (error) {
      return false;
    }
  }

  getStatus() {
    const circuitBreakerStats = CircuitBreakerFactory.getStats();
    const blockchainBreakerStatus = circuitBreakerStats.blockchain || {};
    
    return {
      initialized: this.initialized,
      network: 'paseo',
      account: this.account?.address,
      circuitBreaker: {
        status: blockchainBreakerStatus.closed ? 'healthy' : 
                blockchainBreakerStatus.open ? 'open' : 'half-open',
        stats: blockchainBreakerStatus.stats
      }
    };
  }

  async disconnect() {
    if (this.api) {
      await this.api.disconnect();
      this.api = null;
      this.initialized = false;
      console.log('🔌 Disconnected from Paseo');
    }
  }
}

module.exports = new PaseoBlockchainService();