export interface LastRecording {
  blob: File;
  blobUrl: string;
  fileName: string;
  durationSec: number;
  savedToDisk: boolean;
}

let current: LastRecording | null = null;

export function setLastRecording(r: LastRecording) {
  current = r;
}

export function getLastRecording(): LastRecording | null {
  return current;
}
