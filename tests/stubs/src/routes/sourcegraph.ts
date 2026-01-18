import { Router } from 'express';
import { loadConfig, loadScenario } from '../config';

export const sourcegraphRouter = Router();

// GraphQL endpoint
sourcegraphRouter.post('/graphql', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  const { query, variables } = req.body;
  
  // Simple pattern matching to determine query type
  if (query.includes('search') && variables.query) {
    const searchQuery = variables.query.toLowerCase();
    
    if (searchQuery.includes('type:diff')) {
      // Recent changes search
      res.json(scenario.sourcegraph.recentChanges);
    } else {
      // Regular code search
      res.json(scenario.sourcegraph.search);
    }
  } else {
    res.status(400).json({ error: 'Unsupported query' });
  }
});
