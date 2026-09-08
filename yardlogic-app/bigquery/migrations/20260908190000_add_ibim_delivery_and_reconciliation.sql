-- iBIM delivery and reconciliation analytics tables.
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.ibim_email_deliveries` (
  id STRING NOT NULL, business_id STRING NOT NULL, member_id STRING, proposal_id STRING, task_id STRING,
  recipient STRING NOT NULL, subject STRING NOT NULL, kind STRING NOT NULL, status STRING NOT NULL,
  provider_ref STRING, error STRING, sent_at TIMESTAMP NOT NULL, delivered_at TIMESTAMP
)
PARTITION BY DATE(sent_at)
CLUSTER BY business_id, status;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.ibim_reconciliations` (
  id STRING NOT NULL, business_id STRING NOT NULL, source_system STRING NOT NULL, external_ref STRING,
  policy_number STRING, policy_id STRING, status STRING NOT NULL, differences JSON, source_data JSON NOT NULL,
  checked_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(checked_at)
CLUSTER BY business_id, source_system, status;
