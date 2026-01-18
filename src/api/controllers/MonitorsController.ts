import { Request, Response } from 'express';
import { MonitorManager } from '../../services/detection';
import logger from '../../lib/utils/logger';

/**
 * Monitors API controller
 */
export class MonitorsController {
  constructor(private readonly monitorManager: MonitorManager) {}

  /**
   * List all monitors
   */
  async list(_req: Request, res: Response): Promise<void> {
    try {
      const monitors = this.monitorManager.getAllMonitors();

      res.json({
        data: monitors,
        total: monitors.length,
      });
    } catch (error) {
      logger.error('Failed to list monitors', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list monitors',
        },
      });
    }
  }

  /**
   * Get monitor by ID
   */
  async get(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const monitor = this.monitorManager.getMonitor(id);

      if (!monitor) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Monitor not found',
          },
        });
        return;
      }

      res.json(monitor);
    } catch (error) {
      logger.error('Failed to get monitor', {
        id: req.params.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get monitor',
        },
      });
    }
  }

  /**
   * Reload monitor configuration
   */
  async reload(_req: Request, res: Response): Promise<void> {
    try {
      await this.monitorManager.reloadConfiguration();

      res.json({
        success: true,
        message: 'Monitor configuration reloaded',
        monitorCount: this.monitorManager.getAllMonitors().length,
      });
    } catch (error) {
      logger.error('Failed to reload monitors', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reload monitor configuration',
        },
      });
    }
  }

  /**
   * Get monitor status (for all monitors)
   */
  async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const monitors = this.monitorManager.getAllMonitors();

      const status = monitors.map((monitor) => ({
        id: monitor.id,
        name: monitor.name,
        enabled: monitor.enabled,
        checkIntervalSeconds: monitor.checkIntervalSeconds,
      }));

      res.json({
        data: status,
        total: status.length,
        enabledCount: status.filter((m) => m.enabled).length,
      });
    } catch (error) {
      logger.error('Failed to get monitor status', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get monitor status',
        },
      });
    }
  }
}
