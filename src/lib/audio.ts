export interface MicGraph {
  context: AudioContext;
  micSource: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  analyser: AnalyserNode;
  destination: MediaStreamAudioDestinationNode;
  mixedTrack: MediaStreamTrack;
  setMuted: (muted: boolean) => void;
  dispose: () => void;
}

/** Builds a Web Audio graph mixing the mic (and optionally tab/system audio) into one track,
 *  while exposing an AnalyserNode for a live level meter. */
export function buildMicGraph(micStream: MediaStream, extraStreams: MediaStream[] = []): MicGraph {
  const context = new AudioContext();
  const micSource = context.createMediaStreamSource(micStream);
  const gainNode = context.createGain();
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  const destination = context.createMediaStreamDestination();

  micSource.connect(gainNode);
  gainNode.connect(analyser);
  gainNode.connect(destination);

  const extraSources = extraStreams
    .filter((s) => s.getAudioTracks().length > 0)
    .map((s) => context.createMediaStreamSource(s));
  for (const src of extraSources) {
    src.connect(destination);
  }

  return {
    context,
    micSource,
    gainNode,
    analyser,
    destination,
    mixedTrack: destination.stream.getAudioTracks()[0],
    setMuted: (muted: boolean) => {
      gainNode.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.02);
    },
    dispose: () => {
      micSource.disconnect();
      gainNode.disconnect();
      analyser.disconnect();
      extraSources.forEach((s) => s.disconnect());
      void context.close();
    },
  };
}

/** Reads a 0..1 RMS level from an analyser, meant to be polled on a rAF/interval loop. */
export function readLevel(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  let sumSquares = 0;
  for (const v of data) {
    const norm = (v - 128) / 128;
    sumSquares += norm * norm;
  }
  return Math.min(1, Math.sqrt(sumSquares / data.length) * 4);
}
