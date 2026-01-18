import { TeamsClient } from '../../../../../src/lib/clients/teams/TeamsClient';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn().mockReturnValue({
    post: jest.fn().mockResolvedValue({ status: 200, data: '1' }),
  }),
  isAxiosError: jest.fn().mockReturnValue(false),
}));

// Mock Azure Identity
jest.mock('@azure/identity', () => ({
  ClientSecretCredential: jest.fn().mockImplementation(() => ({
    getToken: jest.fn().mockResolvedValue({ token: 'mock-token' }),
  })),
}));

// Mock Microsoft Graph Client
jest.mock('@microsoft/microsoft-graph-client', () => ({
  Client: {
    initWithMiddleware: jest.fn().mockReturnValue({
      api: jest.fn().mockReturnValue({
        post: jest.fn().mockResolvedValue({ id: 'mock-message-id' }),
      }),
    }),
  },
}));

// Mock config
jest.mock('../../../../../src/config', () => ({
  config: {
    msTeams: {
      tenantId: 'test-tenant',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      defaultChannelWebhook: 'https://webhook.test/channel',
    },
  },
}));

// Mock logger
jest.mock('../../../../../src/lib/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock metrics
jest.mock('../../../../../src/lib/utils/metrics', () => ({
  externalApiCalls: {
    inc: jest.fn(),
  },
  externalApiDuration: {
    startTimer: jest.fn().mockReturnValue(jest.fn()),
  },
}));

describe('TeamsClient', () => {
  let teamsClient: TeamsClient;

  beforeEach(() => {
    jest.clearAllMocks();
    teamsClient = new TeamsClient();
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(teamsClient).toBeDefined();
    });

    it('should report configured status', () => {
      const status = teamsClient.getStatus();
      expect(status.webhookConfigured).toBe(true);
      expect(status.graphConfigured).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('should send message via webhook when webhookUrl is provided', async () => {
      const result = await teamsClient.sendMessage({
        content: 'Test message',
        webhookUrl: 'https://webhook.test/channel',
      });

      expect(result.success).toBe(true);
    });

    it('should use default webhook when no explicit URL is provided', async () => {
      const result = await teamsClient.sendMessage({
        content: 'Test message',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('isConfigured', () => {
    it('should return true when webhook or credentials are configured', () => {
      expect(teamsClient.isConfigured()).toBe(true);
    });
  });
});
