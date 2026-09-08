# IBim Analytics Contract

BigQuery is an analytical projection, not the transactional source of truth. PostgreSQL transactions write an `OutboxEvent`; a retryable publisher normalizes approved events into this dataset.

Dataset: `ibim_analytics`

Rules:

- Never block a PostgreSQL business transaction on BigQuery availability.
- Store organization identifiers and event timestamps on every fact.
- Do not copy passwords, refresh tokens, raw payment secrets, or unmasked contact data.
- Keep schema changes additive and versioned.
- Use event IDs for deduplication.
