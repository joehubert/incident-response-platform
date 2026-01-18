-- Incidents table
CREATE TABLE incidents (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  external_id NVARCHAR(255) UNIQUE NOT NULL,
  monitor_id NVARCHAR(255) NOT NULL,
  service_name NVARCHAR(255) NOT NULL,
  severity NVARCHAR(50) NOT NULL,
  status NVARCHAR(50) NOT NULL DEFAULT 'active',
  investigation_tier NVARCHAR(20),

  metric_name NVARCHAR(255) NOT NULL,
  metric_value FLOAT,
  baseline_value FLOAT,
  threshold_value FLOAT NOT NULL,
  deviation_percentage FLOAT,
  error_message NVARCHAR(MAX),
  stack_trace NVARCHAR(MAX),

  analysis_result NVARCHAR(MAX),

  detected_at DATETIME2 NOT NULL,
  resolved_at DATETIME2,
  created_at DATETIME2 DEFAULT GETDATE(),
  updated_at DATETIME2 DEFAULT GETDATE(),

  tags NVARCHAR(MAX) DEFAULT '[]',

  INDEX idx_incidents_monitor_id (monitor_id),
  INDEX idx_incidents_service_name (service_name),
  INDEX idx_incidents_status (status),
  INDEX idx_incidents_detected_at (detected_at DESC)
);
GO

-- Trigger for updated_at
CREATE TRIGGER trg_incidents_updated_at
ON incidents
AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE incidents
  SET updated_at = GETDATE()
  FROM incidents i
  INNER JOIN inserted ins ON i.id = ins.id;
END;
GO

-- Investigation evidence table
CREATE TABLE investigation_evidence (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  incident_id UNIQUEIDENTIFIER NOT NULL,
  source NVARCHAR(50) NOT NULL,
  evidence_data NVARCHAR(MAX) NOT NULL,
  confidence_score DECIMAL(3, 2),
  relevance_score DECIMAL(3, 2),
  collected_at DATETIME2 DEFAULT GETDATE(),

  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  INDEX idx_evidence_incident_id (incident_id),
  INDEX idx_evidence_source (source)
);
GO

-- API keys table
CREATE TABLE api_keys (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  key_hash NVARCHAR(64) UNIQUE NOT NULL,
  name NVARCHAR(255) NOT NULL,
  description NVARCHAR(MAX),
  created_by NVARCHAR(255),
  created_at DATETIME2 DEFAULT GETDATE(),
  last_used_at DATETIME2,
  expires_at DATETIME2,
  is_active BIT DEFAULT 1,

  INDEX idx_api_keys_key_hash (key_hash)
);
GO

-- LLM usage tracking table
CREATE TABLE llm_usage (
  id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  incident_id UNIQUEIDENTIFIER,

  input_tokens INT NOT NULL,
  output_tokens INT NOT NULL,
  total_tokens AS (input_tokens + output_tokens) PERSISTED,

  model_name NVARCHAR(255) NOT NULL,
  request_duration_ms INT,
  estimated_cost_usd DECIMAL(10, 6),

  created_at DATETIME2 DEFAULT GETDATE(),

  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
  INDEX idx_llm_usage_incident_id (incident_id),
  INDEX idx_llm_usage_created_at (created_at DESC)
);
GO
