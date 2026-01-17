export interface DatadogConfig {
  apiKey: string;
  appKey: string;
  site: string;
  errorTrackingEnabled: boolean;
  deploymentTrackingEnabled: boolean;
}

export interface DatadogErrorDetails {
  errorMessage: string;
  stackTrace: string;
  filePath?: string;
  lineNumber?: number;
  timestamp: Date;
}
