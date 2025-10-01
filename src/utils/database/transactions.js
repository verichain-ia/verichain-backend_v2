const logger = require('../logger');

class DatabaseTransaction {
  constructor(supabaseClient) {
    this.client = supabaseClient;
    this.operations = [];
    this.executedOperations = [];
    this.transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  add(table, operation, data, conditions = null) {
    this.operations.push({ 
      table, 
      operation, 
      data, 
      conditions,
      timestamp: new Date().toISOString()
    });
    return this;
  }

  async execute() {
    const results = [];
    this.executedOperations = [];

    logger.info(`Starting transaction ${this.transactionId}`);

    try {
      for (let i = 0; i < this.operations.length; i++) {
        const op = this.operations[i];
        logger.debug(`Executing operation ${i + 1}/${this.operations.length}`, op);
        
        const result = await this.executeOperation(op);
        
        if (result.error) {
          throw new Error(`Operation failed: ${result.error.message}`);
        }
        
        results.push(result.data);
        this.executedOperations.push({
          ...op,
          result: result.data,
          index: i
        });
      }
      
      logger.info(`Transaction ${this.transactionId} completed successfully`);
      return { 
        success: true, 
        data: results,
        transactionId: this.transactionId
      };
      
    } catch (error) {
      logger.error(`Transaction ${this.transactionId} failed, initiating rollback`, error);
      
      try {
        await this.rollback();
        throw new Error(`Transaction failed and was rolled back: ${error.message}`);
      } catch (rollbackError) {
        logger.error(`CRITICAL: Rollback failed for transaction ${this.transactionId}`, rollbackError);
        throw new Error(`Transaction failed and rollback failed: ${error.message} | Rollback: ${rollbackError.message}`);
      }
    }
  }

  async executeOperation(op) {
    let query;
    
    switch(op.operation) {
      case 'insert':
        query = this.client.from(op.table).insert(op.data).select();
        break;
        
      case 'update':
        query = this.client.from(op.table).update(op.data);
        if (op.conditions) {
          Object.entries(op.conditions).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        query = query.select();
        break;
        
      case 'delete':
        query = this.client.from(op.table).delete();
        if (op.conditions) {
          Object.entries(op.conditions).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }
        query = query.select();
        break;
        
      case 'upsert':
        query = this.client.from(op.table).upsert(op.data).select();
        break;
        
      default:
        throw new Error(`Unknown operation: ${op.operation}`);
    }
    
    return await query;
  }

  async rollback() {
    logger.warn(`Rolling back ${this.executedOperations.length} operations`);
    
    // Rollback in reverse order
    for (let i = this.executedOperations.length - 1; i >= 0; i--) {
      const op = this.executedOperations[i];
      logger.debug(`Rolling back operation ${i + 1}`, op);
      
      try {
        await this.rollbackOperation(op);
      } catch (error) {
        logger.error(`Failed to rollback operation ${i + 1}`, error);
        throw error;
      }
    }
    
    logger.info(`Rollback completed for transaction ${this.transactionId}`);
  }

  async rollbackOperation(op) {
    switch(op.operation) {
      case 'insert':
        // Delete what was inserted
        if (op.result && op.result[0]) {
          await this.client
            .from(op.table)
            .delete()
            .eq('id', op.result[0].id);
        }
        break;
        
      case 'update':
        // Restore previous values (would need to fetch before update)
        logger.warn('Update rollback not fully implemented - manual intervention may be needed');
        break;
        
      case 'delete':
        // Re-insert what was deleted
        if (op.result && op.result[0]) {
          await this.client
            .from(op.table)
            .insert(op.result[0]);
        }
        break;
        
      case 'upsert':
        // Complex - may need manual intervention
        logger.warn('Upsert rollback not fully implemented - manual intervention may be needed');
        break;
    }
  }
}

module.exports = DatabaseTransaction;