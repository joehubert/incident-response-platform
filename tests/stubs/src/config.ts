import fs from 'fs';
import path from 'path';

export interface StubConfig {
  scenario: string;
  baseTimestamp: Date;
  httpPort: number;
  sqlPort: number;
}

export function loadConfig(): StubConfig {
  const scenario = process.env.SCENARIO || 'missing-db-column';
  const baseTimestamp = new Date(process.env.BASE_TIMESTAMP || '2026-01-09T10:00:00Z');
  const httpPort = parseInt(process.env.HTTP_PORT || '3100');
  const sqlPort = parseInt(process.env.SQL_PORT || '1433');

  return {
    scenario,
    baseTimestamp,
    httpPort,
    sqlPort
  };
}

export function loadScenario(scenarioName: string): any {
  const scenarioPath = path.join(__dirname, 'scenarios', `${scenarioName}.json`);
  
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`Scenario not found: ${scenarioName}`);
  }
  
  const data = fs.readFileSync(scenarioPath, 'utf-8');
  return JSON.parse(data);
}
