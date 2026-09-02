import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bigquery, DATASET, TABLE_ENUMS, ALLOWED_TABLES } from "../lib/bigquery";

// Apps Script posts here as:
// { "table": "invoices", "rows": [{...}, {...}] }
// Protected by a shared secret header so only your Apps Script
// deployment can write to BigQuery through this endpoint.

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const secret = req.headers["x-ingest-secret"];
  if (secret !== process.env.INGEST_SHARED_SECRET) {
    return res.status(401).json({ error: "Invalid or missing X-Ingest-Secret header" });
  }

  const { table, rows } = req.body as { table?: string; rows?: Record<string, unknown>[] };

  if (!table || !ALLOWED_TABLES.includes(table)) {
    return res.status(400).json({ error: `table must be one of: ${ALLOWED_TABLES.join(", ")}` });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows must be a non-empty array" });
  }

  // Validate enum columns before they ever reach BigQuery — a bad
  // Apps Script edit shouldn't be able to write garbage into
  // status/role/mode columns.
  const enumRules = TABLE_ENUMS[table];
  if (enumRules) {
    for (const row of rows) {
      for (const [col, allowed] of Object.entries(enumRules)) {
        if (row[col] !== undefined && !allowed.includes(String(row[col]))) {
          return res.status(400).json({ error: `${table}.${col} must be one of: ${allowed.join(", ")}` });
        }
      }
    }
  }

  try {
    await bigquery.dataset(DATASET).table(table).insert(rows, { skipInvalidRows: false, ignoreUnknownValues: false });
    return res.status(200).json({ inserted: rows.length, table });
  } catch (err: any) {
    // BigQuery's insertErrors payload is the most useful debugging
    // info Apps Script will get back — surface it directly.
    const details = err.errors || err.message || String(err);
    return res.status(500).json({ error: "BigQuery insert failed", details });
  }
}
