CREATE TABLE IF NOT EXISTS `ibim_analytics.project_delivery_events` (
  event_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  project_id STRING NOT NULL,
  event_type STRING NOT NULL,
  project_status STRING,
  delivery_type STRING,
  actual_hours NUMERIC,
  estimated_hours NUMERIC,
  occurred_at TIMESTAMP NOT NULL,
  ingested_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(occurred_at)
CLUSTER BY organization_id, project_id, event_type;
