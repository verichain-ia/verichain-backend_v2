const AppError = require('./AppError');

class BlockchainError extends AppError {
  constructor(message, details = null) {
    super(message, 503, 'BLOCKCHAIN_ERROR', details);
  }
}

module.exports = BlockchainError;