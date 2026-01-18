import express from 'express';
import { loadConfig } from './config';
import { datadogRouter } from './routes/datadog';
import { gitlabRouter } from './routes/gitlab';
import { sourcegraphRouter } from './routes/sourcegraph';
import { startSqlServer } from './services/sql-server';

const config = loadConfig();

// HTTP API Server
const app = express();
app.use(express.json());

// Mount routers
app.use('/datadog/api', datadogRouter);
app.use('/gitlab/api', gitlabRouter);
app.use('/sourcegraph/.api', sourcegraphRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    scenario: config.scenario,
    timestamp: new Date().toISOString()
  });
});

// Start HTTP server
const httpServer = app.listen(config.httpPort, () => {
  console.log(`[Stub Service] HTTP API listening on port ${config.httpPort}`);
  console.log(`[Stub Service] Active scenario: ${config.scenario}`);
});

// Start SQL Server
startSqlServer(config.sqlPort, config.scenario);

process.on('SIGTERM', () => {
  console.log('[Stub Service] Shutting down...');
  httpServer.close();
  process.exit(0);
});
