import { Router } from 'express';
import { loadConfig, loadScenario } from '../config';

export const datadogRouter = Router();

// Metrics query
datadogRouter.post('/v1/query', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  // Return scenario-specific metrics
  res.json(scenario.datadog.metrics);
});

// Log search
datadogRouter.post('/v2/logs/events/search', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  res.json(scenario.datadog.logs);
});

// Deployment events
datadogRouter.get('/v2/events', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  res.json(scenario.datadog.deployments);
});
