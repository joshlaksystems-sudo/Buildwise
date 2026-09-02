-- Apply this once to an existing BigQuery dataset. New columns are nullable.
ALTER TABLE `YOUR_PROJECT.khatabook.invoices`
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS notes STRING,
  ADD COLUMN IF NOT EXISTS terms STRING;

ALTER TABLE `YOUR_PROJECT.khatabook.estimates`
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP,
  ADD COLUMN IF NOT EXISTS notes STRING,
  ADD COLUMN IF NOT EXISTS terms STRING;

ALTER TABLE `YOUR_PROJECT.khatabook.delivery_challans`
  ADD COLUMN IF NOT EXISTS vehicle_number STRING,
  ADD COLUMN IF NOT EXISTS transporter_id STRING,
  ADD COLUMN IF NOT EXISTS notes STRING;
