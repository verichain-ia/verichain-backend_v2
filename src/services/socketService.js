// src/services/socketService.js
const socketIO = require('socket.io');
const monitoringService = require('./monitoringService');
const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.io = null;
    this.connections = new Map();
  }

  initialize(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    this.setupEventHandlers();
    logger.info('WebSocket service initialized');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`New WebSocket connection: ${socket.id}`);
      this.connections.set(socket.id, socket);

      // Enviar estado inicial
      this.sendInitialState(socket);

      // Manejar suscripción a métricas
      socket.on('subscribe:metrics', () => {
        this.subscribeToMetrics(socket);
      });

      // Manejar suscripción a alertas
      socket.on('subscribe:alerts', () => {
        this.subscribeToAlerts(socket);
      });

      // Manejar desconexión
      socket.on('disconnect', () => {
        logger.info(`WebSocket disconnected: ${socket.id}`);
        this.connections.delete(socket.id);
      });

      // Ping/Pong para mantener conexión viva
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
  }

  async sendInitialState(socket) {
    try {
      // Enviar health check inicial
      const health = await monitoringService.checkSystemHealth();
      socket.emit('health:update', health);

      // Enviar métricas iniciales
      const metrics = monitoringService.getPerformanceMetrics();
      socket.emit('metrics:update', metrics);
    } catch (error) {
      logger.error('Error sending initial state:', error);
    }
  }

  subscribeToMetrics(socket) {
    // Enviar métricas cada 5 segundos
    const interval = setInterval(async () => {
      try {
        const metrics = monitoringService.getPerformanceMetrics();
        socket.emit('metrics:update', metrics);
      } catch (error) {
        logger.error('Error sending metrics:', error);
      }
    }, 5000);

    // Limpiar intervalo cuando se desconecte
    socket.on('disconnect', () => {
      clearInterval(interval);
    });
  }

  subscribeToAlerts(socket) {
    // Aquí puedes emitir alertas cuando ocurran
    socket.emit('alerts:subscribed', { 
      message: 'Successfully subscribed to alerts' 
    });
  }

  // Método para emitir a todos los clientes conectados
  broadcast(event, data) {
    if (this.io) {
      this.io.emit(event, data);
      logger.debug(`Broadcasting ${event} to ${this.connections.size} clients`);
    }
  }

  // Método para emitir una nueva alerta
  emitAlert(alert) {
    this.broadcast('alert:new', alert);
  }

  // Método para emitir actualización de health
  emitHealthUpdate(health) {
    this.broadcast('health:update', health);
  }

  // Método para obtener estadísticas de conexiones
  getStats() {
    return {
      connections: this.connections.size,
      clients: Array.from(this.connections.keys())
    };
  }
}

module.exports = new SocketService();