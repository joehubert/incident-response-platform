import winston from 'winston';
import { config } from '../../config';

const { combine, timestamp, json, printf, colorize } = winston.format;

// Custom format for console output (development)
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] ${message}`;

  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }

  return msg;
});

// Production format (JSON)
const productionFormat = combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), json());

// Development format (colorized console)
const developmentFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  consoleFormat
);

const isProduction = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: config.server.logLevel,
  format: isProduction ? productionFormat : developmentFormat,
  defaultMeta: {
    service: 'incident-response-platform',
    version: process.env.APP_VERSION || '1.0.0',
  },
  transports: [new winston.transports.Console()],
});

/**
 * Create a child logger with correlation ID support
 */
export function createChildLogger(correlationId: string) {
  return logger.child({ correlationId });
}

// Export logger instance
export default logger;
