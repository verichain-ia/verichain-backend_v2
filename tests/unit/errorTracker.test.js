const { getInstance, ERROR_CATEGORIES } = require('../../src/services/errorTracker');

describe('ErrorTracker Service', () => {
  let errorTracker;

  beforeEach(() => {
    errorTracker = getInstance();
  });

  describe('categorizeError', () => {
    it('should categorize validation errors correctly', () => {
      const error = new Error('Validation failed for field email');
      const category = errorTracker.categorizeError(error);
      expect(category).toBe(ERROR_CATEGORIES.VALIDATION_ERROR);
    });

    it('should categorize JWT errors as authentication errors', () => {
      const error = new Error('JWT token expired');
      const category = errorTracker.categorizeError(error);
      expect(category).toBe(ERROR_CATEGORIES.AUTHENTICATION_ERROR);
    });

    it('should categorize database errors correctly', () => {
      const error = new Error('Database connection failed');
      const category = errorTracker.categorizeError(error);
      expect(category).toBe(ERROR_CATEGORIES.DATABASE_ERROR);
    });

    it('should return UNKNOWN_ERROR for unrecognized errors', () => {
      const error = new Error('Something weird happened');
      const category = errorTracker.categorizeError(error);
      expect(category).toBe(ERROR_CATEGORIES.UNKNOWN_ERROR);
    });
  });

  describe('generateFingerprint', () => {
    it('should generate consistent fingerprints for similar errors', () => {
      const error1 = new Error('User 12345 not found');
      const error2 = new Error('User 67890 not found');
      
      const fp1 = errorTracker.generateFingerprint(error1, ERROR_CATEGORIES.DATABASE_ERROR);
      const fp2 = errorTracker.generateFingerprint(error2, ERROR_CATEGORIES.DATABASE_ERROR);
      
      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different error types', () => {
      const error = new Error('Test error');
      
      const fp1 = errorTracker.generateFingerprint(error, ERROR_CATEGORIES.DATABASE_ERROR);
      const fp2 = errorTracker.generateFingerprint(error, ERROR_CATEGORIES.VALIDATION_ERROR);
      
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('trackError', () => {
    it('should track errors and increment counts', () => {
      const error = new Error('Test error');
      const context = { userId: 'test-user', path: '/test' };
      
      errorTracker.trackError(error, context);
      errorTracker.trackError(error, context);
      
      const stats = errorTracker.getErrorStats();
      expect(stats.totalErrors).toBe(2);
    });

    it('should maintain recent errors list', () => {
      const error = new Error('Recent error');
      errorTracker.trackError(error, {});
      
      const stats = errorTracker.getErrorStats();
      expect(stats.recentErrors.length).toBeGreaterThan(0);
      expect(stats.recentErrors[0].message).toBe('Recent error');
    });
  });
});