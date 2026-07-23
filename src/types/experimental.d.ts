// Ambient declarations for experimental / Chrome-only Web APIs not yet in TS's DOM lib.
export {};

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }

  interface DocumentPictureInPicture {
    requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
    window: Window | null;
    addEventListener(type: 'enter', listener: (ev: Event & { window: Window }) => void): void;
  }

  interface MediaStreamTrackProcessorInit {
    track: MediaStreamTrack;
    maxBufferSize?: number;
  }

  class MediaStreamTrackProcessor<T = VideoFrame> {
    constructor(init: MediaStreamTrackProcessorInit);
    readonly readable: ReadableStream<T>;
  }

  interface FileSystemFileHandle {
    createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
  }

  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemDirectoryHandle {
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface FileSystemSyncAccessHandle {
    read(buffer: ArrayBufferView, options?: { at: number }): number;
    write(buffer: ArrayBufferView, options?: { at: number }): number;
    truncate(newSize: number): void;
    getSize(): number;
    flush(): void;
    close(): void;
  }
}
