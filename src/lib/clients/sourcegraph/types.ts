export interface SourcegraphConfig {
  url: string;
  token: string;
  maxResults: number;
}

export interface SourcegraphSearchQuery {
  pattern: string;
  repositories?: string[];
  excludeTests?: boolean;
  filePatterns?: string[];
  maxResults?: number;
}

export interface SourcegraphSearchResult {
  affectedRepositories: number;
  totalMatchCount: number;
  criticalPaths: string[];
  matches: SourcegraphMatch[];
}

export interface SourcegraphMatch {
  repository: string;
  filePath: string;
  lineNumber: number;
  preview: string;
  matchCount: number;
}

export interface SourcegraphFile {
  repository: string;
  path: string;
  content: string;
  language: string;
}
