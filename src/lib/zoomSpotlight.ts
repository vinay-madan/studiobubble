export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** Smoothly eases a rect towards a target rect. Call once per frame. */
export class RectAnimator {
  current: Rect = { ...FULL };
  private target: Rect = { ...FULL };
  private speed = 8; // higher = snappier

  setTarget(rect: Rect | null) {
    this.target = rect ? clampRect(rect) : { ...FULL };
  }

  step(dtSeconds: number) {
    const t = 1 - Math.exp(-this.speed * dtSeconds);
    this.current = {
      x: lerp(this.current.x, this.target.x, t),
      y: lerp(this.current.y, this.target.y, t),
      w: lerp(this.current.w, this.target.w, t),
      h: lerp(this.current.h, this.target.h, t),
    };
    return this.current;
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clampRect(r: Rect): Rect {
  const w = Math.min(1, Math.max(0.05, r.w));
  const h = Math.min(1, Math.max(0.05, r.h));
  const x = Math.min(1 - w, Math.max(0, r.x));
  const y = Math.min(1 - h, Math.max(0, r.y));
  return { x, y, w, h };
}

/** Draws a dimming vignette everywhere except the focus rect (normalized 0..1 coords). */
export function drawSpotlight(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  focus: Rect,
  opacity = 0.55,
) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${opacity})`;
  const fx = focus.x * canvasW;
  const fy = focus.y * canvasH;
  const fw = focus.w * canvasW;
  const fh = focus.h * canvasH;
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  ctx.rect(fx, fy, fw, fh);
  ctx.fill('evenodd');
  ctx.restore();
}
