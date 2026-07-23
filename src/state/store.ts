import { create } from 'zustand';
import { DEFAULT_SETTINGS, type RecordingSettings, type ZoomState } from '../types';

export type AppScreen = 'setup' | 'countdown' | 'recording' | 'review' | 'library';

interface PendingRecording {
  fileName: string;
  durationSec: number;
}

interface AppState {
  screen: AppScreen;
  settings: RecordingSettings;
  zoom: ZoomState;
  isPaused: boolean;
  isMicMuted: boolean;
  elapsedMs: number;
  micLevel: number;
  saveDirName: string | null;
  pendingRecording: PendingRecording | null;
  floatingDeckOpen: boolean;

  setScreen: (s: AppScreen) => void;
  updateSettings: (patch: Partial<RecordingSettings>) => void;
  updateBubble: (patch: Partial<RecordingSettings['bubble']>) => void;
  setZoom: (z: Partial<ZoomState>) => void;
  setPaused: (p: boolean) => void;
  toggleMicMuted: () => void;
  setElapsedMs: (ms: number) => void;
  setMicLevel: (lvl: number) => void;
  setSaveDirName: (name: string | null) => void;
  setPendingRecording: (r: PendingRecording | null) => void;
  setFloatingDeckOpen: (v: boolean) => void;
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'setup',
  settings: { ...DEFAULT_SETTINGS },
  zoom: { active: false, target: null, spotlight: false },
  isPaused: false,
  isMicMuted: false,
  elapsedMs: 0,
  micLevel: 0,
  saveDirName: null,
  pendingRecording: null,
  floatingDeckOpen: false,

  setScreen: (screen) => set({ screen }),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  updateBubble: (patch) => set((s) => ({ settings: { ...s.settings, bubble: { ...s.settings.bubble, ...patch } } })),
  setZoom: (z) => set((s) => ({ zoom: { ...s.zoom, ...z } })),
  setPaused: (isPaused) => set({ isPaused }),
  toggleMicMuted: () => set((s) => ({ isMicMuted: !s.isMicMuted })),
  setElapsedMs: (elapsedMs) => set({ elapsedMs }),
  setMicLevel: (micLevel) => set({ micLevel }),
  setSaveDirName: (saveDirName) => set({ saveDirName: saveDirName }),
  setPendingRecording: (pendingRecording) => set({ pendingRecording }),
  setFloatingDeckOpen: (floatingDeckOpen) => set({ floatingDeckOpen }),
  toggleTheme: () =>
    set((s) => ({ settings: { ...s.settings, theme: s.settings.theme === 'dark' ? 'light' : 'dark' } })),
}));
