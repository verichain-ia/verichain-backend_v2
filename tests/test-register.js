const paseoService = require('./src/services/blockchain/PaseoService');

async function testRegister() {
  console.log('⏳ Waiting for service to initialize...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('📝 Registering test certificate...');
  
  try {
    const result = await paseoService.registerCertificate({
      id: 'TEST-' + Date.now(),
      recipient: 'John Doe',
      issuer: 'VeriChain',
      hash: 'abc123'
    });
    
    console.log('✅ SUCCESS!');
    console.log('TX Hash:', result.txHash);
    console.log('Network:', result.network);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testRegister();
