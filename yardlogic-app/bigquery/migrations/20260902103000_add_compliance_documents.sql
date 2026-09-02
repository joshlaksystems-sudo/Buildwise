ALTER TABLE `YOUR_PROJECT.khatabook.gst_filings`
  ADD COLUMN IF NOT EXISTS prepared_by_user_id STRING;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.compliance_documents` (
  id                  STRING NOT NULL,
  business_id         STRING NOT NULL,
  uploaded_by_user_id STRING NOT NULL,
  document_type       STRING NOT NULL,
  period              STRING,
  file_name           STRING NOT NULL,
  mime_type           STRING NOT NULL,
  storage_url         STRING,
  storage_path        STRING,
  created_at          TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY business_id, document_type;