// Tiny IndexedDB wrapper. Everything (concerts, wishlist, photos, videos) lives on the device.
const DB_NAME = 'stubs';
const DB_VERSION = 1;

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // items: concerts ({kind: 'concert'}) and wishlist entries ({kind: 'wish'})
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        // media: photo and video blobs, referenced by id from items
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    Promise.resolve(fn(t.objectStore(store))).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  getAll: (store) => tx(store, 'readonly', (s) => promisify(s.getAll())),
  get: (store, id) => tx(store, 'readonly', (s) => promisify(s.get(id))),
  put: (store, value) => tx(store, 'readwrite', (s) => promisify(s.put(value))),
  putMany: (store, values) => tx(store, 'readwrite', (s) => Promise.all(values.map((v) => promisify(s.put(v))))),
  delete: (store, id) => tx(store, 'readwrite', (s) => promisify(s.delete(id))),
  deleteMany: (store, ids) => tx(store, 'readwrite', (s) => Promise.all(ids.map((id) => promisify(s.delete(id))))),
  clear: (store) => tx(store, 'readwrite', (s) => promisify(s.clear())),
};
