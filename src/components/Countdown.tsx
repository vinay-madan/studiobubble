import { useEffect, useState } from 'react';

export function Countdown({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(3);
  useEffect(() => {
    if (n <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => setN((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return <div className="countdown-overlay">{n > 0 ? n : 'Go'}</div>;
}
