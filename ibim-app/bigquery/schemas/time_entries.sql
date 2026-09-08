CREATE TABLE IF NOT EXISTS `ibim_analytics.time_entry_events` (
  event_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  project_id STRING NOT NULL,
  task_id STRING NOT NULL,
  user_id STRING NOT NULL,
  minutes INT64 NOT NULL,
  started_at TIMESTAMP NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  ingested_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(started_at)
CLUSTER BY organization_id, project_id, user_id;
