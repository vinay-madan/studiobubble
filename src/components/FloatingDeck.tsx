import { createPortal } from 'react-dom';
import { Mic, MicOff, Pause, Play, Square, PictureInPicture2 } from 'lucide-react';
import { useDocumentPiP } from '../hooks/useDocumentPiP';
import { useEffect } from 'react';

interface Props {
  timer: string;
  isPaused: boolean;
  isMicMuted: boolean;
  onPauseResume: () => void;
  onStop: () => void;
  onToggleMic: () => void;
}

/** The always-on-top mini control window, backed by Document Picture-in-Picture where supported. */
export function FloatingDeckButton(props: Props) {
  const { isSupported, pipWindow, containerRef, open, close } = useDocumentPiP();

  useEffect(() => {
    return () => close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupported) return null;

  return (
    <>
      <button
        className="icon-btn"
        title="Floating control deck"
        onClick={() => (pipWindow ? close() : void open())}
      >
        <PictureInPicture2 size={16} />
      </button>
      {pipWindow &&
        containerRef.current &&
        createPortal(
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--text)' }}>
            <div className="timer" style={{ fontSize: 22, textAlign: 'center' }}>
              {props.timer}
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="deck-btn" onClick={props.onToggleMic}>
                {props.isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button className={`deck-btn ${props.isPaused ? 'active' : ''}`} onClick={props.onPauseResume}>
                {props.isPaused ? <Play size={18} /> : <Pause size={18} />}
              </button>
              <button className="deck-btn stop" onClick={props.onStop}>
                <Square size={16} />
              </button>
            </div>
          </div>,
          containerRef.current,
        )}
    </>
  );
}
