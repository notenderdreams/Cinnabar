import { parseNotebookFile, type NotebookFile } from '@cinnabar/notebook';

export interface NotebookSummary { id: string; title: string; updatedAt: number }

function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('cinnabar-independent-notebooks', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('documents', { keyPath: 'id' });
      request.result.createObjectStore('index', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('Notebook storage is unavailable.'));
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Close other Cinnabar windows to update notebook storage.'));
    };
  });
}

export async function saveNotebookLocally(file: NotebookFile): Promise<void> {
  const db = await openStorage();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['documents', 'index'], 'readwrite');
      tx.objectStore('documents').put(file);
      tx.objectStore('index').put({ id: file.id, title: file.title, updatedAt: file.updatedAt });
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Could not save the notebook.'));
    });
  } finally { db.close(); }
}

async function readStorage<T>(store: string, read: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openStorage();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const request = read(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Could not read notebooks.'));
    });
  } finally { db.close(); }
}

export async function loadNotebookLocally(id: string): Promise<NotebookFile> {
  const value = await readStorage('documents', store => store.get(id));
  if (!value) throw new Error('The notebook is no longer available on this device.');
  return parseNotebookFile(JSON.stringify(value));
}

export async function listLocalNotebooks(): Promise<NotebookSummary[]> {
  const items: NotebookSummary[] = await readStorage('index', store => store.getAll());
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}
