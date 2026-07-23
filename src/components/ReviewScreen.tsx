import { useEffect, useRef, useState } from 'react';
import { Download, Scissors, Sparkles } from 'lucide-react';
import { getLastRecording } from '../lib/lastRecording';
import { exportRecording, type ExportFormat } from '../lib/exportEngine';
import { loadDirHandle } from '../lib/dirHandleStore';

export function ReviewScreen({ onDone }: { onDone: () => void }) {
  const rec = getLastRecording();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(rec?.durationSec ?? 0);
  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [enhance, setEnhance] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setTrimEnd(rec?.durationSec ?? 0);
  }, [rec]);

  if (!rec) {
    return (
      <div className="content">
        <div className="panel">
          <p>No recording to review yet.</p>
          <button className="primary-btn" onClick={onDone}>
            Back to setup
          </button>
        </div>
      </div>
    );
  }

  async function handleExport() {
    setProgress(0);
    setSavedMsg(null);
    try {
      const blob = await exportRecording(
        { file: rec!.blob, trimStart, trimEnd, format, enhanceAudio: enhance },
        (p) => setProgress(p),
      );
      const dir = await loadDirHandle();
      const name = rec!.fileName.replace(/\.[^.]+$/, '') + `-edited.${format}`;
      if (dir) {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await blob.stream().pipeTo(writable);
        setSavedMsg(`Saved "${name}" to your recordings folder.`);
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setSavedMsg(`Downloaded "${name}".`);
      }
    } catch (err) {
      console.error(err);
      setSavedMsg('Export failed — check the console for details.');
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="content">
      <div className="stage" style={{ flex: 2 }}>
        <video ref={videoRef} src={rec.blobUrl} controls style={{ background: '#000' }} />
      </div>
      <div className="panel" style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span className="field-label row">
            <Scissors size={14} /> Trim
          </span>
          <div className="row">
            <span className="hint">Start {trimStart.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={rec.durationSec}
            step={0.1}
            value={trimStart}
            onChange={(e) => setTrimStart(Math.min(parseFloat(e.target.value), trimEnd - 0.2))}
          />
          <div className="row">
            <span className="hint">End {trimEnd.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={rec.durationSec}
            step={0.1}
            value={trimEnd}
            onChange={(e) => setTrimEnd(Math.max(parseFloat(e.target.value), trimStart + 0.2))}
          />
        </div>

        <div>
          <span className="field-label">Export format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
            <option value="mov">MOV</option>
          </select>
        </div>

        <label className="badge row" style={{ width: 'fit-content' }}>
          <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
          <Sparkles size={14} /> Audio enhance (normalize + de-rumble)
        </label>

        <button className="primary-btn row" onClick={() => void handleExport()} disabled={progress !== null}>
          <Download size={16} /> {progress !== null ? `Exporting… ${Math.round(progress * 100)}%` : 'Export'}
        </button>
        {savedMsg && <p className="hint">{savedMsg}</p>}

        <div className="spacer" />
        <button className="ghost-btn" onClick={onDone}>
          Done — back to library
        </button>
      </div>
    </div>
  );
}
