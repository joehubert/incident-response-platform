export interface StubConfig {
  scenario: 'missing-db-column' | 'config-typo';
  baseTimestamp: string; // ISO 8601
  httpPort: number;      // Default: 3100
  sqlPort: number;       // Default: 1433
}
