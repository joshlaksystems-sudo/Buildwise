-- iBIM operational analytics tables. Neon remains the ACID source of truth.
ALTER TABLE `YOUR_PROJECT.khatabook.ibim_proposals`
ADD COLUMN IF NOT EXISTS form_definition_id STRING;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.ibim_form_definitions` (
  id STRING NOT NULL,
  business_id STRING NOT NULL,
  type STRING NOT NULL,
  version STRING NOT NULL,
  title STRING NOT NULL,
  schema JSON NOT NULL,
  active BOOL NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY business_id, type, active;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.ibim_migration_batches` (
  id STRING NOT NULL,
  business_id STRING NOT NULL,
  source_name STRING NOT NULL,
  status STRING NOT NULL,
  total_rows INT64 NOT NULL,
  accepted INT64 NOT NULL,
  rejected INT64 NOT NULL,
  flagged INT64 NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  error STRING
)
PARTITION BY DATE(started_at)
CLUSTER BY business_id, status;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.ibim_migration_rows` (
  id STRING NOT NULL,
  business_id STRING NOT NULL,
  batch_id STRING NOT NULL,
  row_number INT64 NOT NULL,
  outcome STRING NOT NULL,
  source_data JSON NOT NULL,
  member_id STRING,
  issues JSON,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY business_id, batch_id, outcome;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.ibim_workflow_events` (
  id STRING NOT NULL,
  business_id STRING NOT NULL,
  member_id STRING,
  proposal_id STRING,
  policy_id STRING,
  task_id STRING,
  event_type STRING NOT NULL,
  from_status STRING,
  to_status STRING,
  actor_user_id STRING,
  detail JSON,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY business_id, event_type;
