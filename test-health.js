const QueueManager = require('./src/queues/queueConfig');

async function testHealth() {
  try {
    console.log('1. Obteniendo instancia...');
    const queueManager = QueueManager.getInstance();
    console.log('   ✓ Instancia obtenida');
    
    console.log('2. Llamando getAllQueuesStatus...');
    const statuses = await queueManager.getAllQueuesStatus();
    console.log('   ✓ Status obtenido:', statuses);
    
    console.log('3. Verificando estructura...');
    console.log('   - Tiene queues?:', !!statuses.queues);
    console.log('   - Queues:', Object.keys(statuses.queues || {}));
    
    console.log('4. Verificando health...');
    const allHealthy = Object.values(statuses.queues || {}).every(
      q => q.status === 'active'
    );
    console.log('   - Todos healthy?:', allHealthy);
    
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

testHealth();