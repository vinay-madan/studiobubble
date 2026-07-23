import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Pause, Play, Square, ZoomIn, Sun as SpotlightIcon, RotateCcw } from 'lucide-react';
import { useAppStore } from '../state/store';
import { RecordingEngine, finalizeIntoLibrary } from '../lib/recordingEngine';
import { loadDirHandle } from '../lib/dirHandleStore';
import { setLastRecording } from '../lib/lastRecording';
import { Countdown } from './Countdown';
import { FloatingDeckButton } from './FloatingDeck';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function RecordingScreen({ onFinished }: { onFinished: () => void }) {
  const { settings, isPaused, isMicMuted, elapsedMs, setPaused, toggleMicMuted, setElapsedMs, setMicLevel, setPendingRecording } =
    useAppStore();
  const [counting, setCounting] = useState(true);
  const [started, setStarted] = useState(false);
  const [zoomMode, setZoomMode] = useState<'off' | 'zoom' | 'spotlight'>('off');
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RecordingEngine | null>(null);
  const dragStateRef = useRef<
    | { kind: 'bubble-move' | 'bubble-resize'; startX: number; startY: number; startBubble: typeof settings.bubble }
    | { kind: 'zoom-select'; startX: number; startY: number }
    | null
  >(null);

  const beginEngine = useCallback(async () => {
    const engine = new RecordingEngine(settings, {
      onElapsed: setElapsedMs,
      onMicLevel: setMicLevel,
      onError: (e) => console.error('recording error', e),
    });
    engineRef.current = engine;
    await engine.start();
    if (stageRef.current) {
      engine.canvas.style.width = '100%';
      engine.canvas.style.height = '100%';
      engine.canvas.style.objectFit = 'contain';
      stageRef.current.appendChild(engine.canvas);
    }
    setStarted(true);
  }, [settings, setElapsedMs, setMicLevel]);

  useEffect(() => {
    if (!counting) void beginEngine();
    return () => {
      // cleanup handled explicitly in stop()
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting]);

  const handleStop = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const { fileName, durationSec } = await engine.stop();
    const dir = await loadDirHandle();
    const { blob, blobUrl, savedToDisk } = await finalizeIntoLibrary(fileName, dir);
    setPendingRecording({ fileName, durationSec });
    setLastRecording({ blob, blobUrl, fileName, durationSec, savedToDisk });
    onFinished();
  }, [onFinished, setPendingRecording]);

  const handlePauseResume = useCallback(() => {
    const next = !isPaused;
    setPaused(next);
    engineRef.current?.setPaused(next);
  }, [isPaused, setPaused]);

  const handleToggleMic = useCallback(() => {
    toggleMicMuted();
    engineRef.current?.setMicMuted(!isMicMuted);
  }, [isMicMuted, toggleMicMuted]);

  const snapCorner = useCallback(
    (corner: 1 | 2 | 3 | 4) => {
      const engine = engineRef.current;
      if (!engine) return;
      const margin = engine.bubble.size / 2 + 0.02;
      const positions: Record<1 | 2 | 3 | 4, [number, number]> = {
        1: [margin, margin],
        2: [1 - margin, margin],
        3: [margin, 1 - margin],
        4: [1 - margin, 1 - margin],
      };
      const [x, y] = positions[corner];
      engine.bubble = { ...engine.bubble, x, y };
    },
    [],
  );

  const resetZoom = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.zoomState = { active: false, target: null, spotlight: false };
    setZoomMode('off');
  }, []);

  useKeyboardShortcuts(
    {
      onPauseResume: handlePauseResume,
      onStop: () => void handleStop(),
      onToggleMic: handleToggleMic,
      onToggleBubble: () => {
        const engine = engineRef.current;
        if (engine) engine.bubble = { ...engine.bubble, visible: !engine.bubble.visible };
      },
      onSnapCorner: snapCorner,
      onZoomReset: resetZoom,
    },
    started,
  );

  function stageCoords(e: React.PointerEvent): { nx: number; ny: number } {
    const rect = stageRef.current!.getBoundingClientRect();
    return { nx: (e.clientX - rect.left) / rect.width, ny: (e.clientY - rect.top) / rect.height };
  }

  function onStagePointerDown(e: React.PointerEvent) {
    const engine = engineRef.current;
    if (!engine) return;
    const { nx, ny } = stageCoords(e);
    const b = engine.bubble;
    const distFromCenter = Math.hypot(nx - b.x, ny - b.y);
    const radiusN = (b.size / 2) * 1.05;
    if (b.visible && distFromCenter < radiusN) {
      dragStateRef.current = { kind: 'bubble-move', startX: nx, startY: ny, startBubble: { ...b } };
    } else if (zoomMode !== 'off') {
      dragStateRef.current = { kind: 'zoom-select', startX: nx, startY: ny };
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onStagePointerMove(e: React.PointerEvent) {
    const engine = engineRef.current;
    const drag = dragStateRef.current;
    if (!engine || !drag) return;
    const { nx, ny } = stageCoords(e);
    if (drag.kind === 'bubble-move') {
      engine.bubble = { ...engine.bubble, x: nx, y: ny };
    } else if (drag.kind === 'zoom-select') {
      const x = Math.min(drag.startX, nx);
      const y = Math.min(drag.startY, ny);
      const w = Math.abs(nx - drag.startX);
      const h = Math.abs(ny - drag.startY);
      engine.zoomState = {
        active: true,
        spotlight: zoomMode === 'spotlight',
        target: { x, y, w: Math.max(0.05, w), h: Math.max(0.05, h) },
      };
    }
  }

  function onStagePointerUp() {
    dragStateRef.current = null;
  }

  function onBubbleZoomChange(v: number) {
    if (engineRef.current) engineRef.current.bubble = { ...engineRef.current.bubble, zoom: v };
  }

  return (
    <div className="content" style={{ position: 'relative' }}>
      <div
        ref={stageRef}
        className="stage"
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
      >
        {counting && <Countdown onDone={() => setCounting(false)} />}

        {started && (
          <div className="control-deck">
            <span className="timer">{formatTime(elapsedMs)}</span>
            <button className="deck-btn" onClick={handleToggleMic} title="Mute mic (M)">
              {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button className={`deck-btn ${isPaused ? 'active' : ''}`} onClick={handlePauseResume} title="Pause / resume (Space)">
              {isPaused ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button className="deck-btn stop" onClick={() => void handleStop()} title="Stop (S)">
              <Square size={16} />
            </button>
            <button
              className={`deck-btn ${zoomMode === 'zoom' ? 'active' : ''}`}
              onClick={() => setZoomMode((m) => (m === 'zoom' ? 'off' : 'zoom'))}
              title="Drag to punch in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              className={`deck-btn ${zoomMode === 'spotlight' ? 'active' : ''}`}
              onClick={() => setZoomMode((m) => (m === 'spotlight' ? 'off' : 'spotlight'))}
              title="Drag to spotlight"
            >
              <SpotlightIcon size={16} />
            </button>
            <button className="deck-btn" onClick={resetZoom} title="Reset zoom (Esc / 0)">
              <RotateCcw size={16} />
            </button>
            <FloatingDeckButton
              timer={formatTime(elapsedMs)}
              isPaused={isPaused}
              isMicMuted={isMicMuted}
              onPauseResume={handlePauseResume}
              onStop={() => void handleStop()}
              onToggleMic={handleToggleMic}
            />
          </div>
        )}
      </div>

      {started && settings.layout !== 'screen-only' && (
        <div className="panel" style={{ width: 260 }}>
          <span className="field-label">Camera bubble zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            defaultValue={settings.bubble.zoom}
            onChange={(e) => onBubbleZoomChange(parseFloat(e.target.value))}
          />
          <p className="hint">Drag the bubble to move it. Snap to a corner with 1–4. Toggle it with C.</p>
          <p className="hint">Drag on the stage with Zoom or Spotlight enabled to punch in on a region; Esc or 0 resets.</p>
        </div>
      )}
    </div>
  );
}
