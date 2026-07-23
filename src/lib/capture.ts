import type { Layout, QualityPreset } from '../types';

export interface CaptureResult {
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  micStream: MediaStream | null;
}

export async function acquireStreams(
  layout: Layout,
  quality: QualityPreset,
  micDeviceId: string | null,
  cameraDeviceId: string | null,
  audio: { noiseSuppression: boolean; echoCancellation: boolean; autoGain: boolean },
): Promise<CaptureResult> {
  let screenStream: MediaStream | null = null;
  let cameraStream: MediaStream | null = null;
  let micStream: MediaStream | null = null;

  if (layout !== 'camera-only') {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: quality.width },
        height: { ideal: quality.height },
        frameRate: { ideal: quality.fps },
      },
      audio: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'include',
    } as DisplayMediaStreamOptions);
  }

  if (layout !== 'screen-only') {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: cameraDeviceId ?? undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: micDeviceId ?? undefined,
        noiseSuppression: audio.noiseSuppression,
        echoCancellation: audio.echoCancellation,
        autoGainControl: audio.autoGain,
      },
    });
  } catch {
    micStream = null;
  }

  return { screenStream, cameraStream, micStream };
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}
