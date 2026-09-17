const DATABASE_NAME = "focusboard";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspace";
const WORKSPACE_KEY = "current";

export type StoredWorkspace = {
  version: 1;
  savedAt: string;
  snapshot: unknown;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open local storage."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Local storage operation failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Local storage transaction failed."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Local storage transaction was cancelled."));
    };
  });
}

export async function loadWorkspace(): Promise<StoredWorkspace | null> {
  const stored = await withStore<StoredWorkspace | undefined>("readonly", (store) =>
    store.get(WORKSPACE_KEY),
  );
  return stored ?? null;
}

export async function saveWorkspace(snapshot: unknown): Promise<void> {
  const workspace: StoredWorkspace = {
    version: 1,
    savedAt: new Date().toISOString(),
    snapshot,
  };
  await withStore<IDBValidKey>("readwrite", (store) =>
    store.put(workspace, WORKSPACE_KEY),
  );
}

export async function clearWorkspace(): Promise<void> {
  await withStore<undefined>("readwrite", (store) => store.delete(WORKSPACE_KEY));
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!("storage" in navigator) || !navigator.storage.persist) return null;
  return navigator.storage.persist();
}
