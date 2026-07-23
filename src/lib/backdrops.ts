import { BACKDROPS, type BackdropDef } from '../types';

export function getBackdrop(id: string): BackdropDef {
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS[0];
}

/** Draws a rounded, padded "framing" card containing the source image, with a curated backdrop behind it. */
export function drawFramedScene(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  source: CanvasImageSource,
  canvasW: number,
  canvasH: number,
  srcW: number,
  srcH: number,
  backdrop: BackdropDef,
  screenBlurSourceFrame: CanvasImageSource | null,
) {
  // Background
  if (backdrop.kind === 'gradient' && backdrop.colors) {
    const g = ctx.createLinearGradient(0, 0, canvasW, canvasH);
    backdrop.colors.forEach((c, i) => g.addColorStop(i / (backdrop.colors!.length - 1 || 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else if (backdrop.kind === 'solid' && backdrop.colors) {
    ctx.fillStyle = backdrop.colors[0] === 'transparent' ? '#000000' : backdrop.colors[0];
    ctx.fillRect(0, 0, canvasW, canvasH);
  } else if (backdrop.kind === 'screen-blur' && screenBlurSourceFrame) {
    ctx.save();
    ctx.filter = 'blur(40px) brightness(0.7) saturate(1.2)';
    ctx.drawImage(screenBlurSourceFrame, -20, -20, canvasW + 40, canvasH + 40);
    ctx.restore();
  } else {
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  if (backdrop.id === 'none') {
    ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, canvasW, canvasH);
    return;
  }

  // Padded, rounded, shadowed card containing the source
  const padding = Math.round(Math.min(canvasW, canvasH) * 0.06);
  const cardW = canvasW - padding * 2;
  const cardH = canvasH - padding * 2;
  const radius = Math.round(Math.min(cardW, cardH) * 0.03);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = padding * 0.8;
  ctx.shadowOffsetY = padding * 0.15;
  roundRectPath(ctx, padding, padding, cardW, cardH, radius);
  ctx.clip();
  ctx.fillStyle = '#000';
  ctx.fillRect(padding, padding, cardW, cardH);
  ctx.drawImage(source, 0, 0, srcW, srcH, padding, padding, cardW, cardH);
  ctx.restore();
}

export function roundRectPath(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
