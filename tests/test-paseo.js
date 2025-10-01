async function test() {
  try {
    console.log('🔄 Loading Paseo Service...');
    const paseoService = require('./src/services/blockchain/PaseoService.js');
    
    // Esperar un poco
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('📊 Status:', paseoService.getStatus());
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();