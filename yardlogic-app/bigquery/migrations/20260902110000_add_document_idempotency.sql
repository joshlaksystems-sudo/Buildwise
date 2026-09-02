ALTER TABLE `YOUR_PROJECT.khatabook.invoices`
  ADD COLUMN IF NOT EXISTS client_request_id STRING;

ALTER TABLE `YOUR_PROJECT.khatabook.estimates`
  ADD COLUMN IF NOT EXISTS client_request_id STRING;

ALTER TABLE `YOUR_PROJECT.khatabook.delivery_challans`
  ADD COLUMN IF NOT EXISTS client_request_id STRING;
