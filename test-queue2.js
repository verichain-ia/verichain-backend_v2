const QueueManager = require('./src/queues/queueConfig');

console.log('Tipo de QueueManager:', typeof QueueManager);
console.log('¿Tiene getInstance?:', typeof QueueManager.getInstance === 'function');

if (QueueManager.getInstance) {
  try {
    const instance = QueueManager.getInstance();
    console.log('getInstance funcionó');
    console.log('¿Tiene getAllQueueStatus?:', typeof instance.getAllQueueStatus === 'function');
    
    // Intentar obtener status
    instance.getAllQueueStatus().then(status => {
      console.log('Status obtenido:', status.overallHealth);
      process.exit(0);
    }).catch(err => {
      console.log('Error al obtener status:', err.message);
      process.exit(1);
    });
  } catch (error) {
    console.log('Error:', error.message);
  }
} else {
  console.log('QueueManager no tiene getInstance');
}