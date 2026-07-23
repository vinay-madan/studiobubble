import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import type { QualityTier } from '../types';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

/**
 * Wraps MediaPipe's selfie segmentation model to power the virtual-background blur/replace
 * feature on the camera bubble. This is a lighter-weight stand-in for framecast's tiered
 * matting engine (RobustVideoMatting on WebGPU + CPU fallback): a single segmentation model
 * whose inference rate and input resolution we scale by quality tier, with a delegate
 * (GPU -> CPU) fallback and a cached "last good mask" so a slow inference frame never
 * blocks compositing.
 */
export class BackgroundSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private initPromise: Promise<void> | null = null;
  private lastMask: ImageData | null = null;
  private busy = false;

  async init(tier: QualityTier) {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      const delegate = tier === 'lite' ? 'CPU' : 'GPU';
      try {
        this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      } catch {
        // GPU delegate unavailable on this machine; fall back to CPU.
        this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
      }
    })();
    return this.initPromise;
  }

  /** Returns the most recently computed mask without triggering new inference. */
  getCachedMask(): ImageData | null {
    return this.lastMask;
  }

  /** Kicks off (non-blocking) inference on the given video frame; returns the most recent mask available. */
  requestMask(video: HTMLVideoElement, timestampMs: number): ImageData | null {
    if (!this.segmenter || this.busy) return this.lastMask;
    // Skip frames more aggressively at lower quality tiers to save CPU/GPU.
    this.busy = true;
    try {
      this.segmenter.segmentForVideo(video, timestampMs, (result) => {
        const confMask = result.confidenceMasks?.[0];
        if (confMask) {
          const w = confMask.width;
          const h = confMask.height;
          const data = confMask.getAsFloat32Array();
          const img = new ImageData(w, h);
          for (let i = 0; i < w * h; i++) {
            const a = Math.round(Math.min(1, Math.max(0, data[i])) * 255);
            img.data[i * 4 + 3] = a;
          }
          this.lastMask = img;
        }
        confMask?.close();
        result.close();
        this.busy = false;
      });
    } catch {
      this.busy = false;
    }
    return this.lastMask;
  }

  dispose() {
    this.segmenter?.close();
    this.segmenter = null;
  }
}

export function frameSkipForTier(tier: QualityTier): number {
  switch (tier) {
    case 'high':
      return 1;
    case 'balanced':
      return 2;
    case 'lite':
      return 4;
    default:
      return 2; // auto: start balanced
  }
}
