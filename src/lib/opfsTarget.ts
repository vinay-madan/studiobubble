import { StreamTarget, type StreamTargetChunk } from 'mediabunny';
import OpfsStorageWorker from './opfsStorage.worker?worker';

/**
 * Bridges mediabunny's StreamTarget to a crash-safe OPFS file, backed by a dedicated
 * worker holding a FileSystemSyncAccessHandle. Every chunk mediabunny writes is
 * forwarded to the worker and durably flushed every few writes (~ every couple of
 * seconds of recording), so a renderer crash mid-take leaves a recoverable file
 * instead of nothing.
 */
export class CrashSafeOpfsTarget {
  readonly fileName: string;
  readonly streamTarget: StreamTarget;
  private worker: Worker;
  private ready: Promise<void>;

  constructor(fileName: string) {
    this.fileName = fileName;
    this.worker = new OpfsStorageWorker();
    this.ready = new Promise((resolve, reject) => {
      const onMsg = (ev: MessageEvent) => {
        if (ev.data?.type === 'ready') {
          this.worker.removeEventListener('message', onMsg);
          resolve();
        } else if (ev.data?.type === 'error') {
          this.worker.removeEventListener('message', onMsg);
          reject(new Error(ev.data.message));
        }
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage({ type: 'init', fileName });
    });

    const writable = new WritableStream<StreamTargetChunk>({
      write: async (chunk) => {
        await this.ready;
        const buf = chunk.data.buffer.slice(
          chunk.data.byteOffset,
          chunk.data.byteOffset + chunk.data.byteLength,
        ) as ArrayBuffer;
        this.worker.postMessage({ type: 'write', data: buf, position: chunk.position }, [buf]);
      },
    });

    this.streamTarget = new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 });
  }

  async flush(): Promise<void> {
    await this.ready;
    return new Promise((resolve) => {
      const onMsg = (ev: MessageEvent) => {
        if (ev.data?.type === 'flushed') {
          this.worker.removeEventListener('message', onMsg);
          resolve();
        }
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage({ type: 'flush' });
    });
  }

  /** Closes the sync access handle so the file can be read/moved from the main thread. */
  async close(): Promise<number> {
    await this.ready;
    return new Promise((resolve) => {
      const onMsg = (ev: MessageEvent) => {
        if (ev.data?.type === 'closed') {
          this.worker.removeEventListener('message', onMsg);
          this.worker.terminate();
          resolve(ev.data.size as number);
        }
      };
      this.worker.addEventListener('message', onMsg);
      this.worker.postMessage({ type: 'close' });
    });
  }
}

/** Reads a file previously written to the OPFS root back out as a Blob (main-thread safe, worker handle must be closed first). */
export async function readOpfsFile(fileName: string): Promise<File> {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(fileName);
  return handle.getFile();
}

export async function deleteOpfsFile(fileName: string): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(fileName).catch(() => undefined);
}

/** Copies an OPFS-resident recording into a user-chosen directory (File System Access API). */
export async function promoteToDirectory(
  fileName: string,
  dir: FileSystemDirectoryHandle,
  finalName: string,
): Promise<void> {
  const file = await readOpfsFile(fileName);
  const destHandle = await dir.getFileHandle(finalName, { create: true });
  const writable = await destHandle.createWritable();
  await file.stream().pipeTo(writable);
}
