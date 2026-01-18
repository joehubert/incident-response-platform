import axios, { AxiosInstance } from 'axios';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { config } from '../../../config';
import { ExternalAPIError } from '../../utils/errors';
import logger from '../../utils/logger';
import { externalApiCalls, externalApiDuration } from '../../utils/metrics';
import { RetryStrategy } from '../../utils/retry';
import type { TeamsMessage, TeamsSendResult } from './types';

/**
 * Microsoft Teams client for sending notifications
 *
 * Supports two delivery methods:
 * 1. Incoming Webhooks - Simple, no auth required, limited features
 * 2. Microsoft Graph API - Full featured, requires Azure AD auth
 */
export class TeamsClient {
  private graphClient: Client | null = null;
  private readonly webhookClient: AxiosInstance;
  private readonly retry: RetryStrategy;
  private readonly tenantId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.tenantId = config.msTeams.tenantId;
    this.clientId = config.msTeams.clientId;
    this.clientSecret = config.msTeams.clientSecret;

    // Initialize webhook client
    this.webhookClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Initialize retry strategy
    this.retry = new RetryStrategy({
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      shouldRetry: (error) => {
        // Retry on network errors and 5xx responses
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          return !status || status >= 500;
        }
        return true;
      },
    });

    // Initialize Graph client if credentials are provided
    if (this.tenantId && this.clientId && this.clientSecret) {
      this.initializeGraphClient();
    }
  }

  /**
   * Initialize Microsoft Graph client with Azure AD authentication
   */
  private initializeGraphClient(): void {
    try {
      const credential = new ClientSecretCredential(
        this.tenantId,
        this.clientId,
        this.clientSecret
      );

      this.graphClient = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token.token;
          },
        },
      });

      logger.info('Microsoft Graph client initialized');
    } catch (error) {
      logger.warn('Failed to initialize Graph client, falling back to webhooks only', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send message to Teams channel
   */
  async sendMessage(message: TeamsMessage): Promise<TeamsSendResult> {
    const timer = externalApiDuration.startTimer({ service: 'teams', endpoint: 'message' });

    try {
      logger.debug('Sending Teams message', {
        hasWebhook: !!message.webhookUrl,
        hasChannel: !!message.channelId,
        contentLength: message.content.length,
      });

      let result: TeamsSendResult;

      if (message.webhookUrl) {
        result = await this.sendViaWebhook(message.webhookUrl, message.content);
      } else if (message.teamId && message.channelId) {
        result = await this.sendViaGraphAPI(message.teamId, message.channelId, message.content);
      } else {
        // Use default webhook if configured
        const defaultWebhook = config.msTeams.defaultChannelWebhook;
        if (defaultWebhook) {
          result = await this.sendViaWebhook(defaultWebhook, message.content);
        } else {
          throw new Error('Either webhookUrl or teamId+channelId must be provided');
        }
      }

      timer();
      externalApiCalls.inc({ service: 'teams', status: 'success' });

      logger.info('Teams message sent successfully', {
        messageId: result.messageId,
      });

      return result;
    } catch (error) {
      timer();
      externalApiCalls.inc({ service: 'teams', status: 'error' });

      logger.error('Failed to send Teams message', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ExternalAPIError('Teams', 'Failed to send message', error as Error);
    }
  }

  /**
   * Send message via incoming webhook
   */
  private async sendViaWebhook(webhookUrl: string, content: string): Promise<TeamsSendResult> {
    return await this.retry.execute(async () => {
      const response = await this.webhookClient.post(webhookUrl, {
        text: content,
      });

      // Webhook returns 200 with "1" on success
      if (response.status === 200) {
        return {
          success: true,
        };
      }

      throw new Error(`Unexpected response status: ${response.status}`);
    }, 'teams.webhook');
  }

  /**
   * Send message via Microsoft Graph API
   */
  private async sendViaGraphAPI(
    teamId: string,
    channelId: string,
    content: string
  ): Promise<TeamsSendResult> {
    if (!this.graphClient) {
      throw new Error('Graph client not initialized. Provide Azure AD credentials.');
    }

    return await this.retry.execute(async () => {
      const response = await this.graphClient!.api(`/teams/${teamId}/channels/${channelId}/messages`)
        .post({
          body: {
            content,
            contentType: 'text',
          },
        });

      return {
        success: true,
        messageId: response.id,
      };
    }, 'teams.graphapi');
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return !!(
      config.msTeams.defaultChannelWebhook ||
      (this.tenantId && this.clientId && this.clientSecret)
    );
  }

  /**
   * Get client status
   */
  getStatus(): { webhookConfigured: boolean; graphConfigured: boolean } {
    return {
      webhookConfigured: !!config.msTeams.defaultChannelWebhook,
      graphConfigured: !!this.graphClient,
    };
  }
}
