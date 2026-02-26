export type SavedCsvPayload = {
  csvText: string;
  savedAt: string;
};

const DB_NAME = "landings";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const CSV_STORAGE_KEY = "landings:foreflight_csv";
const DOT_RADIUS_KEY = "landings:dot_radius";
const STATE_STORAGE_KEY = "landings:selected_state";
const HOME_BASE_KEY = "landings:home_base";
const MAP_FILTER_KEY = "landings:map_filter";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getIdbValue<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => {
      resolve((request.result?.value as T) ?? null);
    };
    request.onerror = () => {
      reject(request.error);
    };
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function setIdbValue<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function removeIdbValue(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

function readLocalStorage<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocalStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore write failures (storage full, blocked, etc.)
  }
}

function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

export async function loadSavedCsv(): Promise<SavedCsvPayload | null> {
  try {
    const payload = await getIdbValue<SavedCsvPayload>(CSV_STORAGE_KEY);
    if (payload) return payload;
  } catch {
    // Fall back to localStorage
  }
  return readLocalStorage<SavedCsvPayload>(CSV_STORAGE_KEY);
}

export async function saveSavedCsv(
  csvText: string
): Promise<SavedCsvPayload> {
  const payload: SavedCsvPayload = {
    csvText,
    savedAt: new Date().toISOString()
  };
  try {
    await setIdbValue(CSV_STORAGE_KEY, payload);
  } catch {
    writeLocalStorage(CSV_STORAGE_KEY, payload);
  }
  return payload;
}

export async function clearSavedCsv(): Promise<void> {
  try {
    await removeIdbValue(CSV_STORAGE_KEY);
  } catch {
    // Fall back to localStorage removal
  }
  removeLocalStorage(CSV_STORAGE_KEY);
}

export function loadDotRadius(defaultValue: number): number {
  const stored = readLocalStorage<number>(DOT_RADIUS_KEY);
  if (stored === null || Number.isNaN(stored)) return defaultValue;
  return stored;
}

export function saveDotRadius(value: number): void {
  writeLocalStorage(DOT_RADIUS_KEY, value);
}

export function clearDotRadius(): void {
  removeLocalStorage(DOT_RADIUS_KEY);
}

export function loadSelectedState(defaultValue: string): string {
  const stored = readLocalStorage<string>(STATE_STORAGE_KEY);
  if (!stored) return defaultValue;
  return stored;
}

export function saveSelectedState(value: string): void {
  writeLocalStorage(STATE_STORAGE_KEY, value);
}

export function hasSelectedState(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STATE_STORAGE_KEY) !== null;
}

export function loadHomeBase(defaultValue: string | null): string | null {
  const stored = readLocalStorage<string>(HOME_BASE_KEY);
  if (!stored) return defaultValue;
  return stored;
}

export function saveHomeBase(value: string | null): void {
  if (!value) {
    removeLocalStorage(HOME_BASE_KEY);
    return;
  }
  writeLocalStorage(HOME_BASE_KEY, value);
}

export function loadMapFilter(defaultValue: string): string {
  const stored = readLocalStorage<string>(MAP_FILTER_KEY);
  if (!stored) return defaultValue;
  return stored;
}

export function saveMapFilter(value: string): void {
  writeLocalStorage(MAP_FILTER_KEY, value);
}

export function hasLocalSettings(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(DOT_RADIUS_KEY) !== null ||
    window.localStorage.getItem(STATE_STORAGE_KEY) !== null ||
    window.localStorage.getItem(HOME_BASE_KEY) !== null ||
    window.localStorage.getItem(MAP_FILTER_KEY) !== null
  );
}

export async function clearAllLocalData(): Promise<void> {
  await clearSavedCsv();
  removeLocalStorage(DOT_RADIUS_KEY);
  removeLocalStorage(STATE_STORAGE_KEY);
  removeLocalStorage(HOME_BASE_KEY);
  removeLocalStorage(MAP_FILTER_KEY);
}
