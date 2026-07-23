import { useCallback, useRef, useState } from 'react';

/** Wraps the Document Picture-in-Picture API for the floating control deck. Falls back
 *  gracefully (isSupported=false) on browsers without it. */
export function useDocumentPiP() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isSupported = typeof window !== 'undefined' && !!window.documentPictureInPicture;

  const open = useCallback(async (width = 320, height = 220) => {
    if (!window.documentPictureInPicture) return null;
    const win = await window.documentPictureInPicture.requestWindow({ width, height });
    Array.from(document.styleSheets).forEach((sheet) => {
      try {
        const css = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
        const style = win.document.createElement('style');
        style.textContent = css;
        win.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = win.document.createElement('link');
          link.rel = 'stylesheet';
          link.href = sheet.href;
          win.document.head.appendChild(link);
        }
      }
    });
    win.document.body.style.margin = '0';
    win.document.body.style.background = 'var(--bg, #0b0d12)';
    const container = win.document.createElement('div');
    win.document.body.appendChild(container);
    containerRef.current = container;
    win.addEventListener('pagehide', () => setPipWindow(null), { once: true });
    setPipWindow(win);
    return { win, container };
  }, []);

  const close = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  return { isSupported, pipWindow, containerRef, open, close };
}
