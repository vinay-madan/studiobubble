import {
  Input,
  ALL_FORMATS,
  BlobSource,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  MovOutputFormat,
  CanvasSource,
  AudioSampleSource,
  AudioSample,
  CanvasSink,
  AudioSampleSink,
  QUALITY_HIGH,
} from 'mediabunny';

export type ExportFormat = 'mp4' | 'webm' | 'mov';

export interface ExportOptions {
  file: File | Blob;
  trimStart: number;
  trimEnd: number;
  format: ExportFormat;
  enhanceAudio: boolean;
}

function outputFormatFor(fmt: ExportFormat) {
  if (fmt === 'webm') return new WebMOutputFormat();
  if (fmt === 'mov') return new MovOutputFormat();
  return new Mp4OutputFormat();
}

/**
 * One unified pipeline for trim + format conversion + a simplified "audio enhance" pass
 * (peak-based loudness normalization + a one-pole high-pass rumble filter). This is a
 * lighter-weight stand-in for framecast's RNNoise neural denoise + BS.1770 loudness
 * normalization - a genuine from-scratch RNNoise/BS.1770 implementation is out of scope
 * here, but the shape of the feature (local, one-click audio cleanup) is the same.
 */
export async function exportRecording(
  opts: ExportOptions,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const input = new Input({ source: new BlobSource(opts.file), formats: ALL_FORMATS });
  const videoTrack = await input.getPrimaryVideoTrack();
  const audioTrack = await input.getPrimaryAudioTrack();
  const totalDuration = await input.computeDuration();
  const trimEnd = Math.min(opts.trimEnd, totalDuration);
  const trimStart = Math.max(0, Math.min(opts.trimStart, trimEnd - 0.1));

  const target = new BufferTarget();
  const output = new Output({ format: outputFormatFor(opts.format), target });

  let videoSource: CanvasSource | null = null;
  let drawCanvas: HTMLCanvasElement | null = null;
  let drawCtx: CanvasRenderingContext2D | null = null;
  let canvasSink: CanvasSink | null = null;

  if (videoTrack) {
    const w = await videoTrack.getDisplayWidth();
    const h = await videoTrack.getDisplayHeight();
    drawCanvas = document.createElement('canvas');
    drawCanvas.width = w;
    drawCanvas.height = h;
    drawCtx = drawCanvas.getContext('2d')!;
    videoSource = new CanvasSource(drawCanvas, { codec: 'avc', bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource);
    canvasSink = new CanvasSink(videoTrack);
  }

  let audioSource: AudioSampleSource | null = null;
  let audioSink: AudioSampleSink | null = null;
  if (audioTrack) {
    audioSource = new AudioSampleSource({ codec: 'aac', bitrate: 128_000 });
    output.addAudioTrack(audioSource);
    audioSink = new AudioSampleSink(audioTrack);
  }

  await output.start();

  const jobs: Promise<void>[] = [];

  if (videoSource && canvasSink && drawCtx && drawCanvas) {
    const vSource = videoSource;
    const ctx = drawCtx;
    const cv = drawCanvas;
    jobs.push(
      (async () => {
        for await (const wrapped of canvasSink!.canvases(trimStart, trimEnd)) {
          ctx.drawImage(wrapped.canvas, 0, 0, cv.width, cv.height);
          const ts = Math.max(0, wrapped.timestamp - trimStart);
          await vSource.add(ts, wrapped.duration);
          onProgress?.(Math.min(1, ts / (trimEnd - trimStart)));
        }
        vSource.close();
      })(),
    );
  }

  if (audioSource && audioSink) {
    const aSource = audioSource;
    jobs.push(
      (async () => {
        let gain = 1;
        if (opts.enhanceAudio) {
          let peak = 0;
          for await (const sample of audioSink!.samples(trimStart, trimEnd)) {
            for (let c = 0; c < sample.numberOfChannels; c++) {
              const size = sample.allocationSize({ planeIndex: c, format: 'f32-planar' }) / 4;
              const buf = new Float32Array(size);
              sample.copyTo(buf, { planeIndex: c, format: 'f32-planar' });
              for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
            }
            sample.close();
          }
          gain = peak > 0.0001 ? Math.min(6, 0.9 / peak) : 1;
        }

        // One-pole high-pass state per channel, persisted across chunks (removes low-frequency rumble).
        const hpState: number[] = [];
        const hpPrevIn: number[] = [];
        const alpha = 0.98; // ~ 80-100Hz cutoff at typical 44.1/48kHz sample rates

        for await (const sample of audioSink!.samples(trimStart, trimEnd)) {
          const numCh = sample.numberOfChannels;
          const numFrames = sample.numberOfFrames;

          if (opts.enhanceAudio) {
            const channels: Float32Array[] = [];
            for (let c = 0; c < numCh; c++) {
              const size = sample.allocationSize({ planeIndex: c, format: 'f32-planar' }) / 4;
              const buf = new Float32Array(size);
              sample.copyTo(buf, { planeIndex: c, format: 'f32-planar' });
              if (hpState[c] === undefined) {
                hpState[c] = 0;
                hpPrevIn[c] = 0;
              }
              for (let i = 0; i < buf.length; i++) {
                const x = buf[i];
                const y = alpha * (hpState[c] + x - hpPrevIn[c]);
                hpPrevIn[c] = x;
                hpState[c] = y;
                buf[i] = y * gain;
              }
              channels.push(buf);
            }
            const interleaved = new Float32Array(numFrames * numCh);
            for (let i = 0; i < numFrames; i++) {
              for (let c = 0; c < numCh; c++) interleaved[i * numCh + c] = channels[c][i];
            }
            const newSample = new AudioSample({
              data: interleaved,
              format: 'f32',
              numberOfChannels: numCh,
              sampleRate: sample.sampleRate,
              timestamp: Math.max(0, sample.timestamp - trimStart),
            });
            await aSource.add(newSample);
            newSample.close();
            sample.close();
          } else {
            sample.setTimestamp(Math.max(0, sample.timestamp - trimStart));
            await aSource.add(sample);
            sample.close();
          }
        }
        aSource.close();
      })(),
    );
  }

  await Promise.all(jobs);
  await output.finalize();

  const buffer = target.buffer;
  const mimeType = await output.getMimeType();
  return new Blob([buffer as ArrayBuffer], { type: mimeType });
}
