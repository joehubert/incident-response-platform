import convict from 'convict';

// Add custom URL format
convict.addFormat({
  name: 'url',
  validate: (val: string) => {
    if (val === '') return; // Allow empty string as default
    try {
      new URL(val);
    } catch {
      throw new Error('must be a valid URL');
    }
  },
  coerce: (val: string) => val,
});

export const configSchema = convict({
  server: {
    port: {
      doc: 'HTTP server port',
      format: 'port',
      default: 3000,
      env: 'PORT',
    },
    logLevel: {
      doc: 'Logging level',
      format: ['debug', 'info', 'warn', 'error'],
      default: 'info',
      env: 'LOG_LEVEL',
    },
  },

  datadog: {
    apiKey: {
      doc: 'Datadog API key',
      format: String,
      default: '',
      env: 'DATADOG_API_KEY',
      sensitive: true,
    },
    appKey: {
      doc: 'Datadog application key',
      format: String,
      default: '',
      env: 'DATADOG_APP_KEY',
      sensitive: true,
    },
    site: {
      doc: 'Datadog site',
      format: String,
      default: 'datadoghq.com',
      env: 'DATADOG_SITE',
    },
    errorTrackingEnabled: {
      doc: 'Whether Error Tracking is enabled',
      format: Boolean,
      default: true,
      env: 'DATADOG_ERROR_TRACKING_ENABLED',
    },
    deploymentTrackingEnabled: {
      doc: 'Whether Deployment Tracking is enabled (optional)',
      format: Boolean,
      default: false,
      env: 'DATADOG_DEPLOYMENT_TRACKING_ENABLED',
    },
  },

  gitlab: {
    url: {
      doc: 'GitLab base URL',
      format: 'url',
      default: 'https://gitlab.com',
      env: 'GITLAB_URL',
    },
    token: {
      doc: 'GitLab personal access token',
      format: String,
      default: '',
      env: 'GITLAB_TOKEN',
      sensitive: true,
    },
  },

  gemini: {
    apiKey: {
      doc: 'Google Gemini API key',
      format: String,
      default: '',
      env: 'GEMINI_API_KEY',
      sensitive: true,
    },
    model: {
      doc: 'Gemini model name',
      format: String,
      default: 'gemini-1.5-pro',
      env: 'GEMINI_MODEL',
    },
    maxTokens: {
      doc: 'Maximum tokens per request',
      format: 'nat',
      default: 4000,
      env: 'GEMINI_MAX_TOKENS',
    },
    temperature: {
      doc: 'Model temperature',
      format: Number,
      default: 0.2,
      env: 'GEMINI_TEMPERATURE',
    },
  },

  msTeams: {
    tenantId: {
      doc: 'Azure AD tenant ID',
      format: String,
      default: '',
      env: 'MS_TEAMS_TENANT_ID',
    },
    clientId: {
      doc: 'Azure AD client ID',
      format: String,
      default: '',
      env: 'MS_TEAMS_CLIENT_ID',
    },
    clientSecret: {
      doc: 'Azure AD client secret',
      format: String,
      default: '',
      env: 'MS_TEAMS_CLIENT_SECRET',
      sensitive: true,
    },
    defaultChannelWebhook: {
      doc: 'Default Teams channel webhook URL',
      format: String,
      default: '',
      env: 'MS_TEAMS_DEFAULT_WEBHOOK',
    },
  },

  database: {
    host: {
      doc: 'MS SQL Server host',
      format: String,
      default: 'localhost',
      env: 'DB_HOST',
    },
    port: {
      doc: 'MS SQL Server port',
      format: 'port',
      default: 1433,
      env: 'DB_PORT',
    },
    database: {
      doc: 'Database name',
      format: String,
      default: 'incident_response',
      env: 'DB_NAME',
    },
    username: {
      doc: 'Database username',
      format: String,
      default: 'sa',
      env: 'DB_USERNAME',
    },
    password: {
      doc: 'Database password',
      format: String,
      default: '',
      env: 'DB_PASSWORD',
      sensitive: true,
    },
    readOnlyInvestigation: {
      enabled: {
        doc: 'Enable read-only database investigation',
        format: Boolean,
        default: true,
        env: 'DB_INVESTIGATION_ENABLED',
      },
      timeoutSeconds: {
        doc: 'Query timeout in seconds',
        format: 'nat',
        default: 10,
        env: 'DB_INVESTIGATION_TIMEOUT',
      },
      maxRows: {
        doc: 'Maximum rows to return',
        format: 'nat',
        default: 100,
        env: 'DB_INVESTIGATION_MAX_ROWS',
      },
      auditLogging: {
        doc: 'Enable audit logging for queries',
        format: Boolean,
        default: true,
        env: 'DB_INVESTIGATION_AUDIT',
      },
    },
  },

  redis: {
    host: {
      doc: 'Redis host',
      format: String,
      default: 'localhost',
      env: 'REDIS_HOST',
    },
    port: {
      doc: 'Redis port',
      format: 'port',
      default: 6379,
      env: 'REDIS_PORT',
    },
    password: {
      doc: 'Redis password',
      format: String,
      default: '',
      env: 'REDIS_PASSWORD',
      sensitive: true,
    },
    ttl: {
      baseline: {
        doc: 'Baseline cache TTL (seconds)',
        format: 'nat',
        default: 86400,
        env: 'REDIS_TTL_BASELINE',
      },
      metrics: {
        doc: 'Metrics cache TTL (seconds)',
        format: 'nat',
        default: 300,
        env: 'REDIS_TTL_METRICS',
      },
      repoMetadata: {
        doc: 'Repository metadata cache TTL (seconds)',
        format: 'nat',
        default: 3600,
        env: 'REDIS_TTL_REPO_METADATA',
      },
      llmResponses: {
        doc: 'LLM response cache TTL (seconds)',
        format: 'nat',
        default: 3600,
        env: 'REDIS_TTL_LLM',
      },
    },
  },

  sourcegraph: {
    url: {
      doc: 'Sourcegraph instance URL',
      format: 'url',
      default: 'https://sourcegraph.com',
      env: 'SOURCEGRAPH_URL',
    },
    token: {
      doc: 'Sourcegraph access token',
      format: String,
      default: '',
      env: 'SOURCEGRAPH_TOKEN',
      sensitive: true,
    },
    maxResults: {
      doc: 'Maximum search results',
      format: 'nat',
      default: 10,
      env: 'SOURCEGRAPH_MAX_RESULTS',
    },
  },

  webSearch: {
    enabled: {
      doc: 'Enable web search (optional)',
      format: Boolean,
      default: false,
      env: 'WEB_SEARCH_ENABLED',
    },
    provider: {
      doc: 'Web search provider',
      format: ['duckduckgo'],
      default: 'duckduckgo',
      env: 'WEB_SEARCH_PROVIDER',
    },
    maxSearches: {
      doc: 'Maximum searches per investigation',
      format: 'nat',
      default: 3,
      env: 'WEB_SEARCH_MAX_SEARCHES',
    },
  },

  monitoring: {
    configPath: {
      doc: 'Path to monitors configuration file',
      format: String,
      default: './config/monitors.json',
      env: 'MONITORS_CONFIG_PATH',
    },
    hotReloadEnabled: {
      doc: 'Enable hot reload of monitor configs',
      format: Boolean,
      default: true,
      env: 'MONITORS_HOT_RELOAD',
    },
  },

  investigation: {
    recentDeploymentWindowHours: {
      doc: 'Hours to look back for recent deployments',
      format: 'nat',
      default: 24,
      env: 'INVESTIGATION_DEPLOYMENT_WINDOW_HOURS',
    },
  },
});

export type PlatformConfig = ReturnType<typeof configSchema.getProperties>;
