const QRCode = require('qrcode');

const generateQR = async (text) => {
  try {
    return await QRCode.toDataURL(text);
  } catch (err) {
    console.error('QR generation failed:', err);
    throw err;
  }
};

module.exports = { generateQR };