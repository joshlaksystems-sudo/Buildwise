-- Apply this once to an existing dataset. schema.sql only creates new tables;
-- it does not change tables that already exist.
ALTER TABLE `YOUR_PROJECT.khatabook.invoices`
  ADD COLUMN IF NOT EXISTS customer_name STRING,
  ADD COLUMN IF NOT EXISTS customer_phone STRING,
  ADD COLUMN IF NOT EXISTS customer_email STRING,
  ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMP;

ALTER TABLE `YOUR_PROJECT.khatabook.expenses`
  ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_recurring BOOL,
  ADD COLUMN IF NOT EXISTS recurrence_frequency STRING,
  ADD COLUMN IF NOT EXISTS reference_number STRING;

ALTER TABLE `YOUR_PROJECT.khatabook.compliance_documents`
  ADD COLUMN IF NOT EXISTS ai_document_type STRING,
  ADD COLUMN IF NOT EXISTS ai_confidence FLOAT64,
  ADD COLUMN IF NOT EXISTS extracted_data JSON;

ALTER TABLE `YOUR_PROJECT.khatabook.payment_reminders`
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP;