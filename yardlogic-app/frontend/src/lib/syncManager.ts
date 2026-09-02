import { api } from "./api";
import {
  SyncableModel,
  getAll,
  putRow,
  putRows,
  enqueueOutbox,
  getOutbox,
  clearOutboxEntry,
  getLastSyncedAt,
  setLastSyncedAt,
} from "./offlineDb";

// UUIDs generated on-device — this is what lets a sale, a new item,
// etc. be created while fully offline: the ID never has to come
// from the server, so nothing blocks on connectivity.
function uuid() {
  return crypto.randomUUID();
}

/**
 * Writes a row locally immediately (so the UI updates instantly and
 * works offline), and either syncs it to the server right away (if
 * online) or queues it in the outbox for the next flush (if not).
 * Every page's "create" action should go through this instead of
 * calling api() directly, so it works the same online or offline.
 */
export async function saveLocalFirst(model: SyncableModel, row: Record<string, any>) {
  const withId = { id: row.id || uuid(), updatedAt: new Date().toISOString(), ...row };
  await putRow(model, withId);

  if (navigator.onLine) {
    try {
      await pushOne(model, withId);
      return withId;
    } catch {
      // fall through to queueing — server might be reachable but
      // the request itself failed; don't lose the write
    }
  }
  await enqueueOutbox({ model, row: withId });
  return withId;
}

/** Reads from the local cache first — instant, works offline. */
export async function readLocal<T = any>(model: SyncableModel): Promise<T[]> {
  return getAll<T>(model);
}

async function pushOne(model: SyncableModel, row: any) {
  await api(`/sync/push`, { method: "POST", body: JSON.stringify({ model, rows: [row] }) });
}

/** Sends every queued offline write to the server, oldest first. */
export async function flushOutbox() {
  const pending = await getOutbox();
  for (const entry of pending) {
    try {
      await pushOne(entry.model, entry.row);
      if (entry.outboxId !== undefined) await clearOutboxEntry(entry.outboxId);
    } catch {
      // stop on first failure — likely still offline or server down;
      // remaining entries stay queued for the next attempt
      break;
    }
  }
}

/** Pulls everything changed on the server since the last sync into the local cache. */
export async function pullChanges() {
  const since = await getLastSyncedAt();

  if (!since) {
    // first sync ever on this device — grab everything in one call
    const data = await api<any>("/sync/bootstrap");
    for (const model of Object.keys(data) as SyncableModel[]) {
      if (Array.isArray(data[model])) await putRows(model, data[model]);
    }
    await setLastSyncedAt(data.syncedAt);
    return;
  }

  const models: SyncableModel[] = ["item", "customer", "supplier", "invoice", "expense", "payment", "deliveryChallan", "estimate"];
  let latest = since;
  for (const model of models) {
    const data = await api<any>(`/sync/pull?model=${model}&since=${encodeURIComponent(since)}`);
    if (data.rows.length) await putRows(model, data.rows);
    latest = data.syncedAt;
  }
  await setLastSyncedAt(latest);
}

/** Call once on app load: flushes any queued writes, pulls fresh data, then keeps doing both as connectivity changes. */
export function initSync() {
  const runFullSync = async () => {
    await flushOutbox();
    await pullChanges();
  };

  if (navigator.onLine) runFullSync();

  window.addEventListener("online", runFullSync);
  // Periodic pull while online, in case another device changed data —
  // push is event-driven (via saveLocalFirst) so it doesn't need polling.
  setInterval(() => {
    if (navigator.onLine) runFullSync();
  }, 60_000);
}
