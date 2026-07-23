export type Layout = 'screen-camera' | 'screen-only' | 'camera-only';

export type BubbleShape = 'circle' | 'rounded';

export type QualityTier = 'auto' | 'high' | 'balanced' | 'lite';

/** Virtual background mode applied to the camera bubble itself (blur/replace your room). */
export type BackgroundMode = 'none' | 'blur' | 'replace';

export interface BubbleState {
  /** normalized 0..1 center position within the canvas */
  x: number;
  y: number;
  /** normalized size (fraction of canvas shorter side) */
  size: number;
  shape: BubbleShape;
  /** 1 = no crop-zoom, >1 crops in further on the camera feed */
  zoom: number;
  visible: boolean;
}

export interface ZoomState {
  active: boolean;
  /** normalized target rect within the screen source, 0..1 */
  target: { x: number; y: number; w: number; h: number } | null;
  spotlight: boolean;
}

export interface QualityPreset {
  label: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
}

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
  '1080p30': { label: '1080p / 30fps', width: 1920, height: 1080, fps: 30, videoBitrate: 8_000_000 },
  '1440p30': { label: '1440p / 30fps', width: 2560, height: 1440, fps: 30, videoBitrate: 12_000_000 },
  '1440p60': { label: '1440p / 60fps', width: 2560, height: 1440, fps: 60, videoBitrate: 16_000_000 },
  '4k30': { label: '4K / 30fps', width: 3840, height: 2160, fps: 30, videoBitrate: 24_000_000 },
};

export interface BackdropDef {
  id: string;
  label: string;
  kind: 'gradient' | 'texture' | 'solid' | 'screen-blur';
  colors?: string[];
}

export const BACKDROPS: BackdropDef[] = [
  { id: 'none', label: 'Raw (no frame)', kind: 'solid', colors: ['transparent'] },
  { id: 'studio-violet', label: 'Studio Violet', kind: 'gradient', colors: ['#312e81', '#7c3aed', '#db2777'] },
  { id: 'studio-teal', label: 'Studio Teal', kind: 'gradient', colors: ['#0f172a', '#0891b2', '#22d3ee'] },
  { id: 'warm-sand', label: 'Warm Sand', kind: 'gradient', colors: ['#78350f', '#d97706', '#fde68a'] },
  { id: 'midnight', label: 'Midnight Solid', kind: 'solid', colors: ['#0b0d12'] },
  { id: 'paper', label: 'Paper Solid', kind: 'solid', colors: ['#f4f1ea'] },
  { id: 'screen-blur', label: 'Blurred Screen (content-aware)', kind: 'screen-blur' },
];

export interface RecordingSettings {
  layout: Layout;
  qualityKey: keyof typeof QUALITY_PRESETS;
  micDeviceId: string | null;
  cameraDeviceId: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
  bubble: BubbleState;
  backgroundMode: BackgroundMode;
  backgroundQuality: QualityTier;
  /** Virtual background used behind you when backgroundMode === 'replace' (id into BACKDROPS). */
  cameraBackdropId: string;
  /** Scene framing backdrop (padded card around the whole composited output). */
  backdropId: string;
  framingEnabled: boolean;
  theme: 'light' | 'dark';
}

export const DEFAULT_SETTINGS: RecordingSettings = {
  layout: 'screen-camera',
  qualityKey: '1440p30',
  micDeviceId: null,
  cameraDeviceId: null,
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  bubble: { x: 0.86, y: 0.82, size: 0.22, shape: 'circle', zoom: 1, visible: true },
  backgroundMode: 'none',
  backgroundQuality: 'auto',
  cameraBackdropId: 'studio-violet',
  backdropId: 'none',
  framingEnabled: false,
  theme: 'dark',
};

export interface RecordingMeta {
  name: string;
  createdAt: number;
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
}
