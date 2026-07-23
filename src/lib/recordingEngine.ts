import { Output, Mp4OutputFormat, CanvasSource, MediaStreamAudioTrackSource, QUALITY_HIGH } from 'mediabunny';
import { acquireStreams, stopStream } from './capture';
import { buildMicGraph, readLevel, type MicGraph } from './audio';
import { BackgroundSegmenter, frameSkipForTier } from './segmentation';
import { getBackdrop, drawFramedScene, roundRectPath } from './backdrops';
import { RectAnimator, drawSpotlight, type Rect } from './zoomSpotlight';
import { CrashSafeOpfsTarget, readOpfsFile, promoteToDirectory, deleteOpfsFile } from './opfsTarget';
import { QUALITY_PRESETS, type RecordingSettings, type ZoomState, type BubbleState } from '../types';

export interface EngineCallbacks {
  onElapsed: (ms: number) => void;
  onMicLevel: (lvl: number) => void;
  onError: (err: Error) => void;
}

export class RecordingEngine {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private screenVideo: HTMLVideoElement | null = null;
  private cameraVideo: HTMLVideoElement | null = null;
  private screenStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private micGraph: MicGraph | null = null;

  private output: Output | null = null;
  private videoSource: CanvasSource | null = null;
  private audioSource: MediaStreamAudioTrackSource | null = null;
  private target: CrashSafeOpfsTarget | null = null;

  private segmenter = new BackgroundSegmenter();
  private scratch: HTMLCanvasElement;
  private scratchCtx: CanvasRenderingContext2D;
  private fgCanvas: HTMLCanvasElement;
  private fgCtx: CanvasRenderingContext2D;

  private zoomAnimator = new RectAnimator();
  private running = false;
  private paused = false;
  private elapsedActiveSec = 0;
  private lastFrameTime = 0;
  private frameCounter = 0;
  private meterInterval: number | null = null;
  private pausedAccumMs = 0;
  private pauseStartedAt = 0;

  bubble: BubbleState;
  zoomState: ZoomState = { active: false, target: null, spotlight: false };
  micMuted = false;

  private fileName = `take-${Date.now()}.mp4`;
  private settings: RecordingSettings;
  private callbacks: EngineCallbacks;

  constructor(settings: RecordingSettings, callbacks: EngineCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
    const preset = QUALITY_PRESETS[settings.qualityKey];
    this.canvas = document.createElement('canvas');
    this.canvas.width = preset.width;
    this.canvas.height = preset.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.bubble = { ...settings.bubble };

    this.scratch = document.createElement('canvas');
    this.scratchCtx = this.scratch.getContext('2d')!;
    this.fgCanvas = document.createElement('canvas');
    this.fgCtx = this.fgCanvas.getContext('2d')!;
  }

  get elapsedMs() {
    return this.elapsedActiveSec * 1000;
  }

  async start() {
    const preset = QUALITY_PRESETS[this.settings.qualityKey];
    const { screenStream, cameraStream, micStream } = await acquireStreams(
      this.settings.layout,
      preset,
      this.settings.micDeviceId,
      this.settings.cameraDeviceId,
      this.settings,
    );
    this.screenStream = screenStream;
    this.cameraStream = cameraStream;
    this.micStream = micStream;

    if (screenStream) {
      this.screenVideo = await mountVideo(screenStream);
    }
    if (cameraStream) {
      this.cameraVideo = await mountVideo(cameraStream);
      this.fgCanvas.width = this.cameraVideo.videoWidth || 1280;
      this.fgCanvas.height = this.cameraVideo.videoHeight || 720;
      this.scratch.width = this.fgCanvas.width;
      this.scratch.height = this.fgCanvas.height;
      if (this.settings.backgroundMode !== 'none') {
        await this.segmenter.init(this.settings.backgroundQuality);
      }
    }

    const extraAudio = screenStream && screenStream.getAudioTracks().length > 0 ? [screenStream] : [];
    if (micStream) {
      this.micGraph = buildMicGraph(micStream, extraAudio);
      this.meterInterval = window.setInterval(() => {
        if (this.micGraph) this.callbacks.onMicLevel(readLevel(this.micGraph.analyser));
      }, 100);
    }

    this.fileName = `studiobubble-${Date.now()}.mp4`;
    this.target = new CrashSafeOpfsTarget(this.fileName);
    this.output = new Output({ format: new Mp4OutputFormat(), target: this.target.streamTarget });

    this.videoSource = new CanvasSource(this.canvas, {
      codec: 'avc',
      bitrate: preset.videoBitrate || QUALITY_HIGH,
      keyFrameInterval: 2,
    });
    this.output.addVideoTrack(this.videoSource, { frameRate: preset.fps });

    if (this.micGraph) {
      this.audioSource = new MediaStreamAudioTrackSource(
        this.micGraph.mixedTrack as MediaStreamAudioTrack,
        { codec: 'aac', bitrate: 128_000 },
      );
      this.output.addAudioTrack(this.audioSource);
    }

    await this.output.start();

    this.running = true;
    this.paused = false;
    this.elapsedActiveSec = 0;
    this.lastFrameTime = performance.now();
    this.pausedAccumMs = 0;

    const driver = this.screenVideo ?? this.cameraVideo;
    this.scheduleFrame(driver);
  }

  private scheduleFrame(driver: HTMLVideoElement | null) {
    if (!driver) {
      // No <video> to hang requestVideoFrameCallback off of; fall back to a timer loop.
      const preset = QUALITY_PRESETS[this.settings.qualityKey];
      const tick = () => {
        if (!this.running) return;
        this.renderFrame();
        window.setTimeout(tick, 1000 / preset.fps);
      };
      tick();
      return;
    }
    const cb = () => {
      if (!this.running) return;
      this.renderFrame();
      // requestVideoFrameCallback keeps firing even while the tab is backgrounded in Chrome,
      // unlike requestAnimationFrame - this is what keeps a hidden recording tab alive.
      (driver as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(cb);
    };
    (driver as unknown as { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(cb);
  }

  private renderFrame() {
    const now = performance.now();
    const dtMs = now - this.lastFrameTime;
    this.lastFrameTime = now;
    if (this.paused) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    const dt = dtMs / 1000;

    this.zoomAnimator.setTarget(this.zoomState.active ? this.zoomState.target : null);
    const focus = this.zoomAnimator.step(dt);

    ctx.clearRect(0, 0, w, h);

    if (this.settings.framingEnabled && this.settings.backdropId !== 'none' && this.screenVideo) {
      const backdrop = getBackdrop(this.settings.backdropId);
      const crop = focus;
      const sv = this.screenVideo;
      const sw = sv.videoWidth || w;
      const sh = sv.videoHeight || h;
      drawFramedScene(ctx, sv, w, h, sw, sh, backdrop, sv);
      this.applyZoomCropOverDraw(ctx, sv, w, h, crop);
    } else if (this.screenVideo) {
      this.drawScreenWithZoom(ctx, this.screenVideo, w, h, focus);
    } else {
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, w, h);
    }

    if (this.zoomState.spotlight && this.zoomState.active && this.zoomState.target) {
      drawSpotlight(ctx, w, h, focus);
    }

    if (this.cameraVideo && this.bubble.visible && this.settings.layout !== 'screen-only') {
      this.frameCounter++;
      this.drawCameraBubble(ctx, w, h);
    }

    if (this.videoSource) {
      void this.videoSource.add(this.elapsedActiveSec, dt).catch((e) => this.callbacks.onError(e));
    }
    this.elapsedActiveSec += dt;
    this.callbacks.onElapsed(this.elapsedActiveSec * 1000);
  }

  private drawScreenWithZoom(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number, focus: Rect) {
    const sw = video.videoWidth || w;
    const sh = video.videoHeight || h;
    ctx.drawImage(video, focus.x * sw, focus.y * sh, focus.w * sw, focus.h * sh, 0, 0, w, h);
  }

  private applyZoomCropOverDraw(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number, focus: Rect) {
    // When framing is enabled we still want the live-zoom punch-in to work: redraw the
    // cropped region back into the card area.
    if (focus.x === 0 && focus.y === 0 && focus.w === 1 && focus.h === 1) return;
    const padding = Math.round(Math.min(w, h) * 0.06);
    const cardW = w - padding * 2;
    const cardH = h - padding * 2;
    const radius = Math.round(Math.min(cardW, cardH) * 0.03);
    const sw = video.videoWidth || w;
    const sh = video.videoHeight || h;
    ctx.save();
    roundRectPath(ctx, padding, padding, cardW, cardH, radius);
    ctx.clip();
    ctx.drawImage(video, focus.x * sw, focus.y * sh, focus.w * sw, focus.h * sh, padding, padding, cardW, cardH);
    ctx.restore();
  }

  private drawCameraBubble(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const video = this.cameraVideo!;
    const short = Math.min(w, h);
    const diameter = short * this.bubble.size;
    const cx = this.bubble.x * w;
    const cy = this.bubble.y * h;

    let source: CanvasImageSource = video;
    if (this.settings.backgroundMode !== 'none') {
      source = this.composeVirtualBackground(video);
    }

    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    const zoom = Math.max(1, this.bubble.zoom);
    const cropSize = Math.min(vw, vh) / zoom;
    const sx = (vw - cropSize) / 2;
    const sy = (vh - cropSize) / 2;

    ctx.save();
    ctx.beginPath();
    if (this.bubble.shape === 'circle') {
      ctx.arc(cx, cy, diameter / 2, 0, Math.PI * 2);
    } else {
      roundRectPath(ctx, cx - diameter / 2, cy - diameter / 2, diameter, diameter, diameter * 0.12);
    }
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - diameter / 2, cy - diameter / 2, diameter, diameter);
    ctx.drawImage(source, sx, sy, cropSize, cropSize, cx - diameter / 2, cy - diameter / 2, diameter, diameter);
    ctx.restore();

    ctx.save();
    ctx.lineWidth = Math.max(2, diameter * 0.012);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    if (this.bubble.shape === 'circle') {
      ctx.arc(cx, cy, diameter / 2 - ctx.lineWidth / 2, 0, Math.PI * 2);
    } else {
      roundRectPath(ctx, cx - diameter / 2, cy - diameter / 2, diameter, diameter, diameter * 0.12);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Returns a canvas containing the camera feed with its background blurred or replaced. */
  private composeVirtualBackground(video: HTMLVideoElement): CanvasImageSource {
    const skip = frameSkipForTier(this.settings.backgroundQuality);
    const w = this.fgCanvas.width;
    const h = this.fgCanvas.height;

    const mask: ImageData | null =
      this.frameCounter % skip === 0
        ? this.segmenter.requestMask(video, performance.now())
        : this.segmenter.getCachedMask();

    // Background layer
    this.scratchCtx.save();
    if (this.settings.backgroundMode === 'blur') {
      this.scratchCtx.filter = 'blur(18px)';
      this.scratchCtx.drawImage(video, 0, 0, w, h);
      this.scratchCtx.filter = 'none';
    } else {
      const backdrop = getBackdrop(this.settings.cameraBackdropId);
      if (backdrop.kind === 'gradient' && backdrop.colors) {
        const g = this.scratchCtx.createLinearGradient(0, 0, w, h);
        backdrop.colors.forEach((c, i) => g.addColorStop(i / (backdrop.colors!.length - 1 || 1), c));
        this.scratchCtx.fillStyle = g;
      } else {
        this.scratchCtx.fillStyle = backdrop.colors?.[0] ?? '#111';
      }
      this.scratchCtx.fillRect(0, 0, w, h);
    }
    this.scratchCtx.restore();

    if (!mask) {
      return this.scratch;
    }

    // Foreground cutout via mask alpha, composited on top of the background layer.
    this.fgCtx.clearRect(0, 0, w, h);
    this.fgCtx.drawImage(video, 0, 0, w, h);
    createImageBitmap(mask).then((bmp) => {
      this.fgCtx.save();
      this.fgCtx.globalCompositeOperation = 'destination-in';
      this.fgCtx.drawImage(bmp, 0, 0, w, h);
      this.fgCtx.restore();
      bmp.close();
      this.scratchCtx.drawImage(this.fgCanvas, 0, 0);
    });

    return this.scratch;
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.audioSource?.[paused ? 'pause' : 'resume']();
    if (paused) this.pauseStartedAt = performance.now();
    else {
      this.pausedAccumMs += performance.now() - this.pauseStartedAt;
      this.lastFrameTime = performance.now();
    }
  }

  setMicMuted(muted: boolean) {
    this.micMuted = muted;
    this.micGraph?.setMuted(muted);
  }

  async stop(): Promise<{ fileName: string; durationSec: number }> {
    this.running = false;
    if (this.meterInterval) window.clearInterval(this.meterInterval);

    try {
      this.videoSource?.close();
      this.audioSource?.close();
      await this.output?.finalize();
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }

    const durationSec = this.elapsedActiveSec;
    await this.target?.close();

    this.micGraph?.dispose();
    stopStream(this.screenStream);
    stopStream(this.cameraStream);
    stopStream(this.micStream);
    this.segmenter.dispose();
    this.screenVideo?.remove();
    this.cameraVideo?.remove();

    return { fileName: this.fileName, durationSec };
  }
}

async function mountVideo(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  await new Promise<void>((resolve) => {
    if (video.videoWidth) resolve();
    else video.onloadedmetadata = () => resolve();
  });
  return video;
}

export async function finalizeIntoLibrary(
  fileName: string,
  dir: FileSystemDirectoryHandle | null,
): Promise<{ blob: File; blobUrl: string; savedToDisk: boolean }> {
  if (dir) {
    await promoteToDirectory(fileName, dir, fileName);
    await deleteOpfsFile(fileName);
    const handle = await dir.getFileHandle(fileName);
    const file = await handle.getFile();
    return { blob: file, blobUrl: URL.createObjectURL(file), savedToDisk: true };
  }
  const file = await readOpfsFile(fileName);
  return { blob: file, blobUrl: URL.createObjectURL(file), savedToDisk: false };
}
