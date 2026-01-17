import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import logger from '../../lib/utils/logger';
import { ValidationError } from '../../lib/utils/errors';
import type { MonitorConfig } from '../../lib/types/incident';

// Zod schema for monitor validation
const ThresholdSchema = z.object({
  type: z.enum(['absolute', 'percentage', 'multiplier']),
  warning: z.number(),
  critical: z.number(),
});

const MonitorConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  queries: z.object({
    metric: z.string(),
    errorTracking: z.string().optional(),
    deployment: z.string().optional(),
  }),
  checkIntervalSeconds: z.number().min(30),
  threshold: ThresholdSchema,
  timeWindow: z.string(),
  gitlabRepositories: z.array(z.string()),
  enableDatabaseInvestigation: z.boolean(),
  databaseContext: z
    .object({
      relevantTables: z.array(z.string()),
      relevantSchemas: z.array(z.string()),
    })
    .optional(),
  teamsNotification: z.object({
    channelWebhookUrl: z.string(),
    mentionUsers: z.array(z.string()).optional(),
    urlPatterns: z
      .object({
        datadog: z.string().optional(),
        gitlab: z.string().optional(),
        incident: z.string().optional(),
      })
      .optional(),
  }),
  tags: z.array(z.string()),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
});

const MonitorsFileSchema = z.object({
  monitors: z.array(MonitorConfigSchema),
});

export class MonitorManager {
  private monitors: Map<string, MonitorConfig> = new Map();
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = path.resolve(configPath);
  }

  /**
   * Load monitors from configuration file
   */
  async loadMonitors(): Promise<void> {
    try {
      logger.info('Loading monitor configurations', { path: this.configPath });

      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // Validate against schema
      const validated = MonitorsFileSchema.parse(parsed);

      // Clear existing monitors
      this.monitors.clear();

      // Load enabled monitors
      for (const monitor of validated.monitors) {
        if (monitor.enabled) {
          this.monitors.set(monitor.id, monitor);
          logger.info('Loaded monitor', {
            id: monitor.id,
            name: monitor.name,
            interval: monitor.checkIntervalSeconds,
          });
        } else {
          logger.debug('Skipped disabled monitor', { id: monitor.id, name: monitor.name });
        }
      }

      logger.info('Monitor configurations loaded', { count: this.monitors.size });
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Monitor configuration validation failed', {
          errors: error.errors,
        });
        throw new ValidationError('Invalid monitor configuration', error.errors);
      }

      logger.error('Failed to load monitor configurations', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Reload monitors (for hot reload)
   */
  async reloadMonitors(): Promise<void> {
    logger.info('Reloading monitor configurations');
    await this.loadMonitors();
  }

  /**
   * Get all enabled monitors
   */
  getMonitors(): MonitorConfig[] {
    return Array.from(this.monitors.values());
  }

  /**
   * Get monitor by ID
   */
  getMonitor(id: string): MonitorConfig | undefined {
    return this.monitors.get(id);
  }

  /**
   * Get monitor count
   */
  getMonitorCount(): number {
    return this.monitors.size;
  }
}
