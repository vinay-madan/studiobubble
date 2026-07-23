import { useEffect, useState } from 'react';
import { Trash2, FolderOpen, Play } from 'lucide-react';
import { listRecordings, deleteRecording, type LibraryItem } from '../lib/library';
import { loadDirHandle, saveDirHandle } from '../lib/dirHandleStore';
import { useAppStore } from '../state/store';

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes: number) {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function LibraryScreen() {
  const { saveDirName, setSaveDirName } = useAppStore();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<LibraryItem | null>(null);

  async function refresh() {
    setLoading(true);
    const dir = await loadDirHandle();
    setSaveDirName(dir?.name ?? null);
    const list = await listRecordings(dir);
    setItems(list);
    setLoading(false);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickFolder() {
    if (!window.showDirectoryPicker) return;
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveDirHandle(handle);
      await refresh();
    } catch {
      /* cancelled */
    }
  }

  async function handleDelete(name: string) {
    const dir = await loadDirHandle();
    await deleteRecording(dir, name);
    await refresh();
  }

  return (
    <div className="content" style={{ flexDirection: 'column' }}>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="hint">
          {saveDirName ? `Folder: ${saveDirName}` : 'Using local browser storage — choose a folder to save recordings there.'}
        </span>
        <div className="spacer" />
        <button className="ghost-btn row" onClick={() => void pickFolder()}>
          <FolderOpen size={16} /> {saveDirName ? 'Change folder' : 'Choose folder'}
        </button>
      </div>

      {playing && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <video src={URL.createObjectURL(playing.file)} controls style={{ width: '100%', borderRadius: 10 }} />
          <button className="ghost-btn" style={{ marginTop: 10 }} onClick={() => setPlaying(null)}>
            Close player
          </button>
        </div>
      )}

      {loading ? (
        <p className="hint">Scanning recordings…</p>
      ) : items.length === 0 ? (
        <p className="hint">No recordings yet. Start a take from Setup to see it here.</p>
      ) : (
        <div className="library-grid">
          {items.map((item) => (
            <div className="rec-card" key={item.meta.name}>
              {item.thumbUrl ? (
                <img className="rec-thumb" src={item.thumbUrl} alt="" />
              ) : (
                <div className="rec-thumb" />
              )}
              <div className="rec-meta">
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.meta.name}
                </div>
                <div className="hint">
                  {formatDuration(item.meta.durationSec)} · {formatSize(item.meta.sizeBytes)}
                </div>
              </div>
              <div className="rec-actions">
                <button className="icon-btn" onClick={() => setPlaying(item)} title="Play">
                  <Play size={14} />
                </button>
                <button className="icon-btn" onClick={() => void handleDelete(item.meta.name)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
