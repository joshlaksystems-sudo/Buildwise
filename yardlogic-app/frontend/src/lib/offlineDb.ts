// A small IndexedDB wrapper — no dependency, just the native API.
// Every syncable model gets its own object store (keyed by `id`,
// the same UUID the server uses), plus one `outbox` store holding
// rows created/edited offline that haven't reached the server yet.

export const SYNCABLE_MODELS = ["item", "customer", "supplier", "invoice", "expense", "payment", "deliveryChallan", "estimate"] as const;
export type SyncableModel = (typeof SYNCABLE_MODELS)[number];

const DB_NAME = "joshlak-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const model of SYNCABLE_MODELS) {
        if (!db.objectStoreNames.contains(model)) db.createObjectStore(model, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "outboxId", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Model tables ----------

export async function getAll<T = any>(model: SyncableModel): Promise<T[]> {
  return withStore(model, "readonly", (s) => s.getAll());
}

export async function putRow(model: SyncableModel, row: any): Promise<void> {
  await withStore(model, "readwrite", (s) => s.put(row));
}

export async function putRows(model: SyncableModel, rows: any[]): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(model, "readwrite");
    const store = tx.objectStore(model);
    rows.forEach((r) => store.put(r));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Outbox (pending offline writes) ----------

export interface OutboxEntry {
  outboxId?: number;
  model: SyncableModel;
  row: any;
}

export async function enqueueOutbox(entry: OutboxEntry): Promise<void> {
  await withStore("outbox", "readwrite", (s) => s.add(entry as any));
}

export async function getOutbox(): Promise<OutboxEntry[]> {
  return withStore("outbox", "readonly", (s) => s.getAll());
}

export async function clearOutboxEntry(outboxId: number): Promise<void> {
  await withStore("outbox", "readwrite", (s) => s.delete(outboxId));
}

// ---------- Sync bookkeeping ----------

export async function getLastSyncedAt(): Promise<string | null> {
  const result = await withStore<any>("meta", "readonly", (s) => s.get("lastSyncedAt"));
  return result?.value ?? null;
}

export async function setLastSyncedAt(iso: string): Promise<void> {
  await withStore("meta", "readwrite", (s) => s.put({ key: "lastSyncedAt", value: iso }));
}
