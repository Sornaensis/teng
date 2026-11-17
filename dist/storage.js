/** Browser-only persistence. Workspace content never enters localStorage. */
// This breaking phoneme model starts a separate store; older stores stay untouched.
const DATABASE_NAME = "teng-workspace-v3";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspaces";
const RECORD_KEY = "current";
const PREFERENCES_KEY = "teng-preferences-v3";
let databasePromise = null;
let knownRevision = null;
let saveQueue = Promise.resolve();

export class StorageConflictError extends Error {
  constructor() {
    super(
      "Another tab saved this workspace. Export your current work before reloading to avoid overwriting those changes.",
    );
    this.name = "StorageConflictError";
  }
}

export function openStore() {
  if (!globalThis.indexedDB)
    return Promise.reject(
      new Error(
        "IndexedDB is unavailable. Enable browser storage to save this workspace; export a backup before leaving.",
      ),
    );
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    let abandoned = false;
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME);
    };
    request.onerror = () =>
      reject(
        new Error(
          `Could not open browser storage: ${request.error?.message ?? "access denied"}. Export a backup before leaving.`,
        ),
      );
    request.onblocked = () => {
      abandoned = true;
      reject(
        new Error(
          "Storage upgrade is blocked by another TENG tab. Close that tab and reload.",
        ),
      );
    };
    request.onsuccess = () => {
      const db = request.result;
      if (abandoned) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      resolve(db);
    };
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export async function loadWorkspace() {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
    let saved;
    request.onsuccess = () => {
      saved = request.result;
    };
    transaction.oncomplete = () => {
      knownRevision = saved?.revision ?? 0;
      resolve(saved?.workspace ?? null);
    };
    transaction.onerror = () =>
      reject(
        new Error(
          `Could not read this workspace: ${transaction.error?.message ?? "storage error"}.`,
        ),
      );
    transaction.onabort = () =>
      reject(
        new Error(
          `Reading the workspace was interrupted: ${transaction.error?.message ?? "storage error"}.`,
        ),
      );
  });
}

export function saveWorkspace(workspace) {
  // Capture at the call boundary so a queued save cannot observe later edits.
  const snapshot = structuredClone(workspace);
  const save = async () => {
    if (knownRevision === null)
      throw new Error(
        "Load the workspace before saving so existing work cannot be overwritten.",
      );
    const db = await openStore();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(RECORD_KEY);
      let result, failure;
      request.onsuccess = () => {
        const actualRevision = request.result?.revision ?? 0;
        if (actualRevision !== knownRevision) {
          failure = new StorageConflictError();
          transaction.abort();
          return;
        }
        result = {
          revision: actualRevision + 1,
          savedAt: new Date().toISOString(),
        };
        store.put({ ...result, workspace: snapshot }, RECORD_KEY);
      };
      transaction.oncomplete = () => {
        knownRevision = result.revision;
        resolve(result);
      };
      const failed = () =>
        reject(
          failure ??
            new Error(
              `Workspace was not saved: ${transaction.error?.message ?? "browser storage unavailable or full"}. Export a backup before leaving.`,
            ),
        );
      transaction.onabort = failed;
      transaction.onerror = failed;
    });
  };
  const result = saveQueue.then(save, save);
  saveQueue = result.catch(() => {});
  return result;
}

export function loadPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}

/** False means preferences could not persist; workspace saving remains independent. */
export function savePreferences(preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
