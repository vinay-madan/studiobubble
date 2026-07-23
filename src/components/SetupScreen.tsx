import { useEffect, useRef, useState } from 'react';
import { Camera, Monitor, Circle, Moon, Sun, FolderOpen, Sparkles } from 'lucide-react';
import { useAppStore } from '../state/store';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { BACKDROPS, QUALITY_PRESETS, type Layout } from '../types';
import { buildMicGraph, readLevel, type MicGraph } from '../lib/audio';
import { MicLevelMeter } from './MicLevelMeter';
import { saveDirHandle, loadDirHandle } from '../lib/dirHandleStore';

const LAYOUTS: { id: Layout; label: string }[] = [
  { id: 'screen-camera', label: 'Screen + camera bubble' },
  { id: 'screen-only', label: 'Screen only' },
  { id: 'camera-only', label: 'Camera only' },
];

export function SetupScreen({ onStart }: { onStart: () => void }) {
  const { settings, updateSettings, saveDirName, setSaveDirName } = useAppStore();
  const { mics, cameras, permitted, requestPermission } = useMediaDevices();
  const [micLevel, setMicLevel] = useState(0);
  const camPreviewRef = useRef<HTMLVideoElement>(null);
  const micGraphRef = useRef<MicGraph | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    void loadDirHandle().then((h) => setSaveDirName(h?.name ?? null));
  }, [setSaveDirName]);

  // Live mic level preview
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: settings.micDeviceId ?? undefined },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micGraphRef.current = buildMicGraph(stream);
        const loop = () => {
          if (micGraphRef.current) setMicLevel(readLevel(micGraphRef.current.analyser));
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        /* mic permission denied */
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      micGraphRef.current?.dispose();
      micGraphRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [settings.micDeviceId]);

  // Live camera preview
  useEffect(() => {
    if (settings.layout === 'screen-only') return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: settings.cameraDeviceId ?? undefined },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (camPreviewRef.current) {
          camPreviewRef.current.srcObject = stream;
          await camPreviewRef.current.play().catch(() => undefined);
        }
      } catch {
        /* camera permission denied */
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [settings.cameraDeviceId, settings.layout]);

  async function pickFolder() {
    if (!window.showDirectoryPicker) {
      alert('Your browser does not support the File System Access API. Recordings will stay in local browser storage.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveDirHandle(handle);
      setSaveDirName(handle.name);
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="content" style={{ flexWrap: 'wrap' }}>
      <div className="panel" style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <span className="field-label">Layout</span>
          <div className="pill-group" style={{ flexDirection: 'column' }}>
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                className={`pill ${settings.layout === l.id ? 'selected' : ''}`}
                onClick={() => updateSettings({ layout: l.id })}
              >
                <span className="row">
                  {l.id === 'camera-only' ? <Camera size={14} /> : <Monitor size={14} />}
                  {l.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Quality</span>
          <select
            value={settings.qualityKey}
            onChange={(e) => updateSettings({ qualityKey: e.target.value as keyof typeof QUALITY_PRESETS })}
          >
            {Object.entries(QUALITY_PRESETS).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="field-label">Microphone</span>
          <select value={settings.micDeviceId ?? ''} onChange={(e) => updateSettings({ micDeviceId: e.target.value || null })}>
            <option value="">System default</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || 'Microphone'}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 8 }}>
            <MicLevelMeter level={micLevel} />
          </div>
          <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <label className="badge">
              <input
                type="checkbox"
                checked={settings.noiseSuppression}
                onChange={(e) => updateSettings({ noiseSuppression: e.target.checked })}
              />{' '}
              Noise suppression
            </label>
            <label className="badge">
              <input
                type="checkbox"
                checked={settings.echoCancellation}
                onChange={(e) => updateSettings({ echoCancellation: e.target.checked })}
              />{' '}
              Echo cancel
            </label>
            <label className="badge">
              <input type="checkbox" checked={settings.autoGain} onChange={(e) => updateSettings({ autoGain: e.target.checked })} />{' '}
              Auto-gain
            </label>
          </div>
          {!permitted && <p className="hint">Grant mic/camera permission to see device names and preview.</p>}
        </div>

        <div>
          <span className="field-label">Save folder</span>
          <button className="ghost-btn row" onClick={() => void pickFolder()}>
            <FolderOpen size={16} /> {saveDirName ? saveDirName : 'Choose a folder…'}
          </button>
          <p className="hint">If no folder is chosen, recordings stay in local browser storage and can be exported from the Library.</p>
        </div>
      </div>

      <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {settings.layout !== 'screen-only' && (
          <div>
            <span className="field-label">Camera preview</span>
            <video ref={camPreviewRef} muted playsInline style={{ width: 240, borderRadius: 12, background: '#000' }} />
            <select
              style={{ marginTop: 8 }}
              value={settings.cameraDeviceId ?? ''}
              onChange={(e) => updateSettings({ cameraDeviceId: e.target.value || null })}
            >
              <option value="">System default</option>
              {cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label || 'Camera'}
                </option>
              ))}
            </select>
          </div>
        )}

        {settings.layout !== 'screen-only' && (
          <div>
            <span className="field-label row">
              <Sparkles size={14} /> Virtual background
            </span>
            <div className="pill-group">
              {(['none', 'blur', 'replace'] as const).map((m) => (
                <button
                  key={m}
                  className={`pill ${settings.backgroundMode === m ? 'selected' : ''}`}
                  onClick={() => updateSettings({ backgroundMode: m })}
                >
                  {m === 'none' ? 'Off' : m === 'blur' ? 'Blur my room' : 'Replace backdrop'}
                </button>
              ))}
            </div>
            {settings.backgroundMode !== 'none' && (
              <div style={{ marginTop: 10 }}>
                <span className="field-label">Quality</span>
                <div className="pill-group">
                  {(['auto', 'high', 'balanced', 'lite'] as const).map((t) => (
                    <button
                      key={t}
                      className={`pill ${settings.backgroundQuality === t ? 'selected' : ''}`}
                      onClick={() => updateSettings({ backgroundQuality: t })}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {settings.backgroundMode === 'replace' && (
              <div style={{ marginTop: 10 }}>
                <span className="field-label">Backdrop</span>
                <div className="pill-group">
                  {BACKDROPS.filter((b) => b.kind !== 'screen-blur' && b.id !== 'none').map((b) => (
                    <div
                      key={b.id}
                      className={`swatch ${settings.cameraBackdropId === b.id ? 'selected' : ''}`}
                      style={{
                        width: 60,
                        background:
                          b.kind === 'gradient'
                            ? `linear-gradient(135deg, ${b.colors!.join(',')})`
                            : b.colors?.[0],
                      }}
                      onClick={() => updateSettings({ cameraBackdropId: b.id })}
                      title={b.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <span className="field-label">Bubble shape</span>
          <div className="pill-group">
            <button
              className={`pill ${settings.bubble.shape === 'circle' ? 'selected' : ''}`}
              onClick={() => updateSettings({ bubble: { ...settings.bubble, shape: 'circle' } })}
            >
              <span className="row">
                <Circle size={14} /> Circle
              </span>
            </button>
            <button
              className={`pill ${settings.bubble.shape === 'rounded' ? 'selected' : ''}`}
              onClick={() => updateSettings({ bubble: { ...settings.bubble, shape: 'rounded' } })}
            >
              Rounded
            </button>
          </div>
        </div>

        <div>
          <span className="field-label">Scene framing</span>
          <div className="row">
            <label className="badge">
              <input
                type="checkbox"
                checked={settings.framingEnabled}
                onChange={(e) => updateSettings({ framingEnabled: e.target.checked })}
              />{' '}
              Wrap recording in a styled backdrop
            </label>
          </div>
          {settings.framingEnabled && (
            <div className="pill-group" style={{ marginTop: 10 }}>
              {BACKDROPS.map((b) => (
                <div
                  key={b.id}
                  className={`swatch ${settings.backdropId === b.id ? 'selected' : ''}`}
                  style={{
                    width: 60,
                    background:
                      b.kind === 'gradient'
                        ? `linear-gradient(135deg, ${b.colors!.join(',')})`
                        : b.kind === 'screen-blur'
                          ? 'repeating-linear-gradient(45deg,#333,#333 4px,#444 4px,#444 8px)'
                          : b.colors?.[0],
                  }}
                  onClick={() => updateSettings({ backdropId: b.id })}
                  title={b.label}
                />
              ))}
            </div>
          )}
        </div>

        <div className="spacer" />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="ghost-btn row" onClick={() => useAppStore.getState().toggleTheme()}>
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />} Theme
          </button>
          <button className="primary-btn" onClick={onStart}>
            Start recording
          </button>
        </div>
      </div>
    </div>
  );
}
