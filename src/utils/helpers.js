const crypto = require('crypto');

const generateCertificateId = () => {
  const timestamp = Date.now().toString().slice(-10);
  const random = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `C${timestamp}${random}`;
};

const hashData = (data) => {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

module.exports = {
  generateCertificateId,
  hashData
};