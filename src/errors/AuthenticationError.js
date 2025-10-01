const AppError = require('./AppError');

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTH_ERROR');
  }
}

module.exports = AuthenticationError;