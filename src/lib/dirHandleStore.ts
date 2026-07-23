import { openDB } from 'idb';

const DB_NAME = 'studiobubble-handles';
const STORE = 'handles';
const KEY = 'saveDir';

async function db() {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    },
  });
}

export async function saveDirHandle(handle: FileSystemDirectoryHandle) {
  const d = await db();
  await d.put(STORE, handle, KEY);
}

export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const d = await db();
    const handle = (await d.get(STORE, KEY)) as FileSystemDirectoryHandle | undefined;
    if (!handle) return null;
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return handle;
    const req = await handle.requestPermission({ mode: 'readwrite' });
    return req === 'granted' ? handle : null;
  } catch {
    return null;
  }
}
