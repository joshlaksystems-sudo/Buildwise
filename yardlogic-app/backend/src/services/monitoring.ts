export async function reportUnhandledError(error: unknown, context: { requestId?: string; path: string; method: string }) {
  const webhook = process.env.MONITORING_WEBHOOK_URL;
  const message = error instanceof Error ? error.message : String(error);
  console.error("Unhandled API error", { ...context, message });
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `YardLogic API error [${context.requestId || "unknown"}] ${context.method} ${context.path}: ${message}` }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch (alertError) {
    console.error("Monitoring alert failed", alertError);
  }
}
