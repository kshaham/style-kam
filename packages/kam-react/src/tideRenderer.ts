/**
 * Canvas renderer for the web.
 *
 * Identical pass structure to `kam-react/renderer.ts` — spill, halo, bloom,
 * core, all additive — so a Tide and a Facet rim on the same screen agree about
 * how bright a border is. The blurred passes go through one offscreen layer and
 * are blurred once on composite; blurring per stretch would mean a hundred
 * blurs a frame.
 */

import {
  type Rgb,
  type Rim,
  type Stretch,
  type TideGeometry,
  type TideOptions,
  type TideState,
  mixPalette,
  rimPointAt,
  sampleStretch,
} from "kam-core";

export interface RenderStyle {
  /** Core line width, in CSS pixels. */
  thickness: number;
  /** Bloom blur radius. 0 disables every blurred pass. */
  glow: number;
  /** How much colour washes the surface inside the box, 0..1. */
  spill: number;
}

const HALO_BLUR = 1.8;
const HALO_WIDTH = 7;

/** Matches `haloExtent` in kam-react so the two can share a bleed convention. */
export function haloExtent(style: RenderStyle): number {
  const core = Math.ceil((style.thickness * HALO_WIDTH) / 2);
  if (style.glow <= 0) return core;
  return Math.ceil(style.glow * HALO_BLUR * 2.5 + core);
}

export interface FrameInput {
  ctx: CanvasRenderingContext2D;
  layer: CanvasRenderingContext2D | null;
  rim: Rim;
  stretches: readonly Stretch[];
  /** Closed outline of the box, for clipping the inner spill. */
  clip: Path2D;
  palette: readonly Rgb[];
  options: TideOptions;
  geo: TideGeometry;
  style: RenderStyle;
  state: TideState;
  /** Seconds since the current state began. */
  time: number;
  width: number;
  height: number;
  bleed: number;
}

interface Lit {
  stretch: Stretch;
  color: Rgb;
  alpha: number;
  white: number;
  width: number;
}

export function renderFrame(input: FrameInput): void {
  const { ctx, layer, rim, stretches, clip, palette, options, geo, style, state, time } = input;
  const { bleed, width, height } = input;
  const stops = palette.length;
  const weights = new Array(stops).fill(0);

  ctx.clearRect(-bleed, -bleed, width, height);
  ctx.globalCompositeOperation = "lighter";

  const lit: Lit[] = [];
  for (const stretch of stretches) {
    const s = sampleStretch(stretch.x, stretch.y, time, state, options, geo);
    if (s.alpha <= 0.002 && s.white <= 0.002) continue;
    weights.fill(0);
    const scaled = ((s.u % 1) + 1) % 1 * stops;
    const lo = Math.floor(scaled) % stops;
    const hi = (lo + 1) % stops;
    const f = scaled - Math.floor(scaled);
    weights[lo] = 1 - f;
    weights[hi] = f;
    lit.push({
      stretch,
      color: mixPalette(palette, weights),
      alpha: Math.min(0.95, s.alpha),
      white: s.white,
      width: 0.85 + 0.9 * s.crest,
    });
  }
  if (lit.length === 0) {
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  const trace = (target: CanvasRenderingContext2D, stretch: Stretch) => {
    const span = stretch.s1 - stretch.s0;
    const steps = Math.max(2, Math.ceil(span / 4));
    target.beginPath();
    for (let i = 0; i <= steps; i++) {
      const p = rimPointAt(rim, stretch.s0 + (span * i) / steps);
      if (i === 0) target.moveTo(p.x, p.y);
      else target.lineTo(p.x, p.y);
    }
  };

  const strokeAll = (target: CanvasRenderingContext2D, widthMul: number, alphaMul: number) => {
    target.lineCap = "round";
    target.lineJoin = "round";
    for (const item of lit) {
      target.lineWidth = Math.max(0.4, item.width * style.thickness * widthMul);
      target.strokeStyle = rgba(item.color, item.alpha * alphaMul);
      trace(target, item.stretch);
      target.stroke();
    }
  };

  const blurredPass = (widthMul: number, alphaMul: number, blur: number, clipTo?: Path2D) => {
    if (!layer) return;
    layer.globalCompositeOperation = "source-over";
    layer.clearRect(-bleed, -bleed, width, height);
    layer.globalCompositeOperation = "lighter";
    strokeAll(layer, widthMul, alphaMul);
    ctx.save();
    if (clipTo) ctx.clip(clipTo);
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(layer.canvas, -bleed, -bleed, width, height);
    ctx.restore();
  };

  if (style.glow > 0) {
    if (style.spill > 0) blurredPass(14, 0.2 * style.spill, style.glow * 2.2, clip);
    blurredPass(HALO_WIDTH, 0.22, style.glow * HALO_BLUR);
    blurredPass(2.8, 0.6, style.glow);
  }

  ctx.filter = "none";
  strokeAll(ctx, 1, 1);

  for (const item of lit) {
    if (item.white <= 0.004) continue;
    ctx.lineWidth = Math.max(0.5, style.thickness * 0.5);
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, item.white).toFixed(4)})`;
    trace(ctx, item.stretch);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
}

function rgba(c: Rgb, alpha: number): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.max(0, Math.min(1, alpha)).toFixed(4)})`;
}
