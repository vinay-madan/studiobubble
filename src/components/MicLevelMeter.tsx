export function MicLevelMeter({ level }: { level: number }) {
  return (
    <div className="meter" style={{ width: 90 }}>
      <div style={{ width: `${Math.round(level * 100)}%` }} />
    </div>
  );
}
