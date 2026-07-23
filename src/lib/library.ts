import { Input, ALL_FORMATS, BlobSource, CanvasSink } from 'mediabunny';
import type { RecordingMeta } from '../types';

export interface LibraryItem {
  meta: RecordingMeta;
  file: File;
  thumbUrl: string | null;
}

async function dirEntries(dir: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && /\.(mp4|webm|mov)$/i.test(name)) {
      files.push(await (handle as FileSystemFileHandle).getFile());
    }
  }
  return files;
}

async function opfsEntries(): Promise<File[]> {
  const root = await navigator.storage.getDirectory();
  const files: File[] = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind === 'file' && /\.(mp4|webm|mov)$/i.test(name)) {
      files.push(await (handle as FileSystemFileHandle).getFile());
    }
  }
  return files;
}

async function buildMeta(file: File): Promise<LibraryItem> {
  let durationSec = 0;
  let width = 0;
  let height = 0;
  let thumbUrl: string | null = null;
  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    durationSec = await input.computeDuration();
    const track = await input.getPrimaryVideoTrack();
    if (track) {
      width = await track.getDisplayWidth();
      height = await track.getDisplayHeight();
      const sink = new CanvasSink(track, { width: 320 });
      const wrapped = await sink.getCanvas(Math.min(1, durationSec / 2));
      if (wrapped) {
        const blob = await new Promise<Blob | null>((resolve) => {
          if (wrapped.canvas instanceof HTMLCanvasElement) {
            wrapped.canvas.toBlob(resolve, 'image/jpeg', 0.8);
          } else {
            (wrapped.canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.8 }).then(resolve);
          }
        });
        if (blob) thumbUrl = URL.createObjectURL(blob);
      }
    }
  } catch {
    /* best-effort metadata; ignore unreadable files */
  }
  return {
    meta: { name: file.name, createdAt: file.lastModified, durationSec, width, height, sizeBytes: file.size },
    file,
    thumbUrl,
  };
}

export async function listRecordings(dir: FileSystemDirectoryHandle | null): Promise<LibraryItem[]> {
  const files = dir ? await dirEntries(dir) : await opfsEntries();
  files.sort((a, b) => b.lastModified - a.lastModified);
  return Promise.all(files.map(buildMeta));
}

export async function deleteRecording(dir: FileSystemDirectoryHandle | null, name: string): Promise<void> {
  if (dir) {
    await dir.removeEntry(name);
  } else {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(name);
  }
}
