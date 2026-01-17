import { configSchema } from './schema';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Load configuration file if it exists
const configFile = process.env.CONFIG_FILE || './config/default.json';
const configPath = path.resolve(process.cwd(), configFile);

try {
  configSchema.loadFile(configPath);
} catch (_error) {
  console.warn(`Could not load config file from ${configPath}, using defaults and env vars`);
}

// Validate configuration
configSchema.validate({ allowed: 'strict' });

// Export configuration
export const config = configSchema.getProperties();

// Export for use in other modules
export { configSchema };
export type { PlatformConfig } from './schema';
