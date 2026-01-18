import { Router } from 'express';
import { loadConfig, loadScenario } from '../config';

export const gitlabRouter = Router();

// Get commits
gitlabRouter.get('/v4/projects/:projectId/repository/commits', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  res.json(scenario.gitlab.commits);
});

// Get commit diff
gitlabRouter.get('/v4/projects/:projectId/repository/commits/:sha/diff', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  // Find the diff for this commit
  const commit = scenario.gitlab.commits.find((c: any) => c.id === req.params.sha);
  
  if (!commit) {
    return res.status(404).json({ error: 'Commit not found' });
  }
  
  res.json(scenario.gitlab.diffs[req.params.sha] || []);
});

// Get file content
gitlabRouter.get('/v4/projects/:projectId/repository/files/:filePath', (req, res) => {
  const config = loadConfig();
  const scenario = loadScenario(config.scenario);
  
  const filePath = decodeURIComponent(req.params.filePath);
  const file = scenario.gitlab.files[filePath];
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.json(file);
});
