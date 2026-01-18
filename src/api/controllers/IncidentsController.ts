import { Request, Response } from 'express';
import { DatabaseClient } from '../../lib/clients/database';
import logger from '../../lib/utils/logger';
import type { IncidentStatus } from '../../lib/types/common';

/**
 * Incidents API controller
 */
export class IncidentsController {
  constructor(private readonly database: DatabaseClient) {}

  /**
   * List incidents with pagination and filters
   */
  async list(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as IncidentStatus | undefined;
      const severity = req.query.severity as string | undefined;
      const monitorId = req.query.monitorId as string | undefined;

      const result = await this.database.listIncidents({
        page,
        limit,
        status,
        severity,
        monitorId,
      });

      res.json({
        data: result.incidents,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      logger.error('Failed to list incidents', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list incidents',
        },
      });
    }
  }

  /**
   * Get incident by ID
   */
  async get(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const incident = await this.database.getIncident(id);

      if (!incident) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Incident not found',
          },
        });
        return;
      }

      res.json(incident);
    } catch (error) {
      logger.error('Failed to get incident', {
        id: req.params.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get incident',
        },
      });
    }
  }

  /**
   * Update incident
   */
  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Check if incident exists
      const incident = await this.database.getIncident(id);
      if (!incident) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Incident not found',
          },
        });
        return;
      }

      // Handle status change to resolved
      if (updates.status === 'resolved' && incident.status !== 'resolved') {
        updates.resolvedAt = new Date();
      }

      await this.database.updateIncident(id, updates);

      res.json({ success: true });
    } catch (error) {
      logger.error('Failed to update incident', {
        id: req.params.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update incident',
        },
      });
    }
  }

  /**
   * Get incident statistics
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const activeCount = await this.database.getActiveIncidentCount();

      res.json({
        activeIncidents: activeCount,
      });
    } catch (error) {
      logger.error('Failed to get incident stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get incident statistics',
        },
      });
    }
  }
}
