/// <reference lib="webworker" />
// Dedicated worker: owns a FileSystemSyncAccessHandle on an OPFS file and performs
// durable, crash-safe writes. Sync access handles are only obtainable inside a worker,
// and writes are applied immediately (no swap-file semantics), which is what makes
// this recoverable if the tab/renderer crashes mid-recording.

type InMsg =
  | { type: 'init'; fileName: string }
  | { type: 'write'; data: ArrayBuffer; position: number }
  | { type: 'flush' }
  | { type: 'close' }
  | { type: 'readAll' };

type OutMsg =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'flushed' }
  | { type: 'closed'; size: number }
  | { type: 'data'; buffer: ArrayBuffer };

let handle: FileSystemSyncAccessHandle | null = null;
let writesSinceFlush = 0;

async function init(fileName: string) {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileName, { create: true });
  handle = await fileHandle.createSyncAccessHandle();
  handle.truncate(0);
  post({ type: 'ready' });
}

function post(msg: OutMsg, transfer?: Transferable[]) {
  self.postMessage(msg, transfer ?? []);
}

self.onmessage = async (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case 'init':
        await init(msg.fileName);
        break;
      case 'write': {
        if (!handle) throw new Error('storage worker not initialized');
        handle.write(new Uint8Array(msg.data), { at: msg.position });
        writesSinceFlush += 1;
        if (writesSinceFlush >= 8) {
          handle.flush();
          writesSinceFlush = 0;
        }
        break;
      }
      case 'flush':
        handle?.flush();
        writesSinceFlush = 0;
        post({ type: 'flushed' });
        break;
      case 'readAll': {
        if (!handle) throw new Error('storage worker not initialized');
        const size = handle.getSize();
        const buf = new ArrayBuffer(size);
        handle.read(new Uint8Array(buf), { at: 0 });
        post({ type: 'data', buffer: buf }, [buf]);
        break;
      }
      case 'close': {
        const size = handle?.getSize() ?? 0;
        handle?.flush();
        handle?.close();
        handle = null;
        post({ type: 'closed', size });
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
