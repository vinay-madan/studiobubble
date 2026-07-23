import { useEffect } from 'react';

export interface ShortcutHandlers {
  onPauseResume?: () => void;
  onStop?: () => void;
  onToggleMic?: () => void;
  onToggleBubble?: () => void;
  onSnapCorner?: (corner: 1 | 2 | 3 | 4) => void;
  onZoomReset?: () => void;
}

/** Space pause, S stop, M mic, C bubble, 1-4 snap corners, Esc/0 exit zoom. */
export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handlers.onPauseResume?.();
          break;
        case 'KeyS':
          handlers.onStop?.();
          break;
        case 'KeyM':
          handlers.onToggleMic?.();
          break;
        case 'KeyC':
          handlers.onToggleBubble?.();
          break;
        case 'Digit1':
          handlers.onSnapCorner?.(1);
          break;
        case 'Digit2':
          handlers.onSnapCorner?.(2);
          break;
        case 'Digit3':
          handlers.onSnapCorner?.(3);
          break;
        case 'Digit4':
          handlers.onSnapCorner?.(4);
          break;
        case 'Escape':
        case 'Digit0':
          handlers.onZoomReset?.();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers, enabled]);
}
