const QueueManager = require('./src/queues/queueConfig');

console.log('Tipo de QueueManager:', typeof QueueManager);
console.log('¿Es una función?:', typeof QueueManager === 'function');
console.log('¿Tiene getInstance?:', typeof QueueManager.getInstance === 'function');

try {
  const instance = QueueManager.getInstance();
  console.log('getInstance funcionó:', instance !== undefined);
} catch (error) {
  console.log('Error al llamar getInstance:', error.message);
}