import { useEffect, useState, useCallback } from 'react';

export function useMediaDevices() {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [permitted, setPermitted] = useState(false);

  const refresh = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setMics(devices.filter((d) => d.kind === 'audioinput'));
    setCameras(devices.filter((d) => d.kind === 'videoinput'));
    setPermitted(devices.some((d) => d.label !== ''));
  }, []);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // user declined; device labels will stay blank
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [refresh]);

  return { mics, cameras, permitted, requestPermission, refresh };
}
