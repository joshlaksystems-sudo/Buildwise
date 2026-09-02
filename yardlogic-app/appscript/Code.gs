/**
 * Khatabook+ → BigQuery ingest, via Apps Script.
 *
 * Setup:
 * 1. Extensions > Apps Script in your Sheet (or any Apps Script project).
 * 2. Project Settings > Script Properties, add:
 *      INGEST_URL     = https://your-vercel-app.vercel.app/api/insert
 *      INGEST_SECRET  = the same string as INGEST_SHARED_SECRET in Vercel's .env
 * 3. Deploy this as a Web App (Deploy > New deployment > Web app) if you
 *    want an external trigger (e.g. from a form), OR just run
 *    pushRowsToBigQuery() directly / on a time-driven trigger.
 */

function getConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    url: props.getProperty("INGEST_URL"),
    secret: props.getProperty("INGEST_SECRET"),
  };
}

/**
 * Sends an array of row objects to a given BigQuery table via the
 * Vercel ingest API. Call this from anywhere in your Apps Script —
 * a sheet edit trigger, a form submit trigger, a time-driven trigger.
 *
 * @param {string} table  One of the tables in bigquery/schema.sql
 *                         (e.g. "invoices", "items", "expenses")
 * @param {Object[]} rows Array of plain objects matching the table's
 *                         columns exactly (snake_case keys).
 */
function pushRowsToBigQuery(table, rows) {
  const { url, secret } = getConfig_();
  if (!url || !secret) {
    throw new Error("Set INGEST_URL and INGEST_SECRET in Script Properties first.");
  }

  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Ingest-Secret": secret },
    payload: JSON.stringify({ table, rows }),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText());

  if (code !== 200) {
    throw new Error(`BigQuery insert failed (${code}): ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Example: push every row of the active sheet's "Invoices" tab into
 * the invoices table, assuming column headers match the BigQuery
 * column names (business_id, customer_id, number, type, status, ...).
 * Wire this to a time-driven trigger (Triggers > Add Trigger) to run
 * every N minutes for automated syncing.
 */
function syncInvoicesSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Invoices");
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const rows = data
    .filter((row) => row.join("").trim() !== "") // skip blank rows
    .map((row) => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    });

  if (rows.length === 0) {
    Logger.log("No rows to sync.");
    return;
  }

  const result = pushRowsToBigQuery("invoices", rows);
  Logger.log(`Inserted ${result.inserted} rows into invoices.`);
}

/**
 * Web app entry point — lets an external system (or a simple HTML
 * form) POST rows directly to this Apps Script, which relays them
 * to BigQuery. Deploy via Deploy > New deployment > Web app,
 * execute as "Me", access "Anyone with the link".
 *
 * Expected POST body: { "table": "expenses", "rows": [{...}] }
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const result = pushRowsToBigQuery(payload.table, payload.rows);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
