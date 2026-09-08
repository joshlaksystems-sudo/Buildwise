CREATE TABLE IF NOT EXISTS `ibim_analytics.payment_events` (
  event_id STRING NOT NULL,
  organization_id STRING NOT NULL,
  user_id STRING NOT NULL,
  provider STRING NOT NULL,
  provider_transaction_id STRING NOT NULL,
  amount NUMERIC NOT NULL,
  currency STRING NOT NULL,
  status STRING NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  ingested_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(occurred_at)
CLUSTER BY organization_id, provider, status;
