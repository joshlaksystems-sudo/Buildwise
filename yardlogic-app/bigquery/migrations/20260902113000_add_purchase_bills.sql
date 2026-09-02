CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.purchase_bills` (
  id                STRING NOT NULL,
  business_id       STRING NOT NULL,
  supplier_id       STRING,
  number            STRING NOT NULL,
  status            STRING DEFAULT 'DRAFT' NOT NULL,
  sub_total         FLOAT64 NOT NULL,
  discount          FLOAT64 DEFAULT 0,
  tax_total         FLOAT64 DEFAULT 0,
  grand_total       FLOAT64 NOT NULL,
  amount_paid       FLOAT64 DEFAULT 0,
  payment_mode      STRING,
  due_date          TIMESTAMP,
  reference_number  STRING,
  client_request_id STRING,
  updated_at        TIMESTAMP,
  created_at        TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY business_id, status;

CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.khatabook.purchase_bill_items` (
  id          STRING NOT NULL,
  bill_id     STRING NOT NULL,
  item_id     STRING,
  name        STRING NOT NULL,
  quantity    FLOAT64 NOT NULL,
  unit_price  FLOAT64 NOT NULL,
  discount    FLOAT64 DEFAULT 0,
  tax_rate    FLOAT64 DEFAULT 0,
  line_total  FLOAT64 NOT NULL
)
CLUSTER BY bill_id;