import { Connection, Request } from 'tedious';
import * as net from 'net';
import { loadConfig, loadScenario } from '../config';

export function startSqlServer(port: number, scenarioName: string) {
  const scenario = loadScenario(scenarioName);
  
  const server = net.createServer((socket) => {
    console.log('[SQL Server] Client connected');
    
    // Simple TDS protocol mock
    // For MVP, we'll implement basic query pattern matching
    
    socket.on('data', (data) => {
      const query = parseQuery(data);
      
      if (!query) {
        return;
      }
      
      console.log(`[SQL Server] Query: ${query.substring(0, 100)}...`);
      
      const response = getQueryResponse(query, scenario);
      socket.write(formatTdsResponse(response));
    });
    
    socket.on('end', () => {
      console.log('[SQL Server] Client disconnected');
    });
  });
  
  server.listen(port, () => {
    console.log(`[Stub Service] SQL Server listening on port ${port}`);
  });
}

function parseQuery(data: Buffer): string | null {
  // Simplified query parsing
  // In a real implementation, we'd parse the TDS protocol
  // For stub purposes, we'll look for SQL keywords
  const str = data.toString('utf-8');
  
  if (str.includes('SELECT') || str.includes('select')) {
    return str;
  }
  
  return null;
}

function getQueryResponse(query: string, scenario: any): any {
  const queryLower = query.toLowerCase();
  
  // Schema query
  if (queryLower.includes('information_schema.columns')) {
    return scenario.database.schema;
  }
  
  // NULL check
  if (queryLower.includes('is null')) {
    return scenario.database.nullCheck || { error: 'Invalid column name' };
  }
  
  // Missing indexes
  if (queryLower.includes('dm_db_missing_index')) {
    return scenario.database.missingIndexes || [];
  }
  
  // Slow queries
  if (queryLower.includes('dm_exec_query_stats')) {
    return scenario.database.slowQueries || [];
  }
  
  // DDL history
  if (queryLower.includes('ddl') || queryLower.includes('audit')) {
    return scenario.database.ddlHistory || [];
  }
  
  // Default: empty result
  return [];
}

function formatTdsResponse(data: any): Buffer {
  // Simplified TDS response formatting
  // In production, we'd properly format according to TDS spec
  
  const json = JSON.stringify(data);
  return Buffer.from(json, 'utf-8');
}
