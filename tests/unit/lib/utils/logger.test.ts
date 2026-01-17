import { logger, createChildLogger } from '../../../../src/lib/utils/logger';

describe('Logger', () => {
  it('should create logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeInstanceOf(Function);
  });

  it('should create child logger with correlation ID', () => {
    const childLogger = createChildLogger('test-123');
    expect(childLogger).toBeDefined();
  });
});
