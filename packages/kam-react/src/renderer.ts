/**
 * Canvas renderer for the web.
 *
 * Four passes per frame, all in `lighter` (additive) blend so overlapping
 * facets accumulate like light rather than painting over one another:
 *
 *   1. spill  — very wide, blurred, clipped to the box; washes the surface
 *   2. halo   — wide, blurred, outside the box; the atmosphere around the rim
 *   3. bloom  — moderate, blurred; the glow the rim sits inside
 *   4. core   — thin, sharp; the facet itself, plus its white glint
 *
 * The blurred passes are drawn to an offscreen layer and blurred once on
 * composite. Setting `ctx.filter` and stroking each facet individually would
 * mean one blur per facet — around a hundred per frame per element, which is
 * far too slow to animate.
 */

import {
  type Facet,
  type FacetOptions,
  type FacetSample,
  type Rgb,
  type Rim,
  createSample,
  mixPalette,
  rimPointAt,
  sampleFacet,
} from "kam-core";

export interface RenderStyle {
  /** Core line width, in CSS pixels. */
  thickness: number;
  /** Blur radius of the bloom pass. 0 disables every blurred pass. */
  glow: number;
  /** Strength of the soft wash of colour across the surface inside, 0..1. */
  spill: number;
}

/** Blur radius and line width of the outermost pass, relative to the style. */
const HALO_BLUR = 1.8;
const HALO_WIDTH = 7;

/**
 * How far the widest pass reaches beyond the rim, in CSS pixels.
 *
 * The canvas has to be at least this much larger than the box or the halo is
 * cut off against the canvas edge — a hard straight line across an otherwise
 * soft glow. `Facet` uses this to size its bleed, so the two cannot drift
 * apart. A Gaussian is truncated at 2.5σ, past which it contributes under a
 * percent of a pass that is already at a fifth opacity.
 */
export function haloExtent(style: RenderStyle): number {
  const core = Math.ceil((style.thickness * HALO_WIDTH) / 2);
  if (style.glow <= 0) return core;
  return Math.ceil(style.glow * HALO_BLUR * 2.5 + core);
}

interface FacetPath {
  points: Array<{ x: number; y: number }>;
}

/** ~4px between samples keeps corner arcs smooth without wasting segments. */
function sampleRim(rim: Rim, start: number, end: number): FacetPath {
  const span = end - start;
  const steps = Math.max(2, Math.ceil(span / 4));
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const p = rimPointAt(rim, start + (span * i) / steps);
    points.push({ x: p.x, y: p.y });
  }
  return { points };
}

/** Polyline approximation of each facet's span of the rim. */
export function buildPaths(rim: Rim, facets: readonly Facet[]): FacetPath[] {
  return facets.map((facet) => sampleRim(rim, facet.start, facet.end));
}

/**
 * The closed rounded rectangle itself, used to clip the inner spill so it
 * washes over the surface without also fogging the space outside the box.
 */
export function buildClipPath(rim: Rim): Path2D {
  const outline = sampleRim(rim, 0, rim.length);
  const path = new Path2D();
  path.moveTo(outline.points[0].x, outline.points[0].y);
  for (let i = 1; i < outline.points.length; i++) {
    path.lineTo(outline.points[i].x, outline.points[i].y);
  }
  path.closePath();
  return path;
}

function tracePath(ctx: CanvasRenderingContext2D, path: FacetPath): void {
  const pts = path.points;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

/**
 * Scratch canvas for the blurred passes, kept alongside the target so several
 * `Facet` instances on a page share one rather than each holding its own.
 */
export interface RenderTarget {
  ctx: CanvasRenderingContext2D;
  layer: CanvasRenderingContext2D | null;
}

export function createLayer(
  width: number,
  height: number,
  dpr: number,
  bleed: number,
): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, bleed * dpr);
  return ctx;
}

export interface FrameInput {
  ctx: CanvasRenderingContext2D;
  /** Offscreen scratch context, same size and transform as `ctx`. */
  layer: CanvasRenderingContext2D | null;
  rim: Rim;
  facets: readonly Facet[];
  paths: readonly FacetPath[];
  /** Closed outline of the box, for clipping the inner spill. */
  clip: Path2D;
  palette: readonly Rgb[];
  options: FacetOptions;
  style: RenderStyle;
  time: number;
  /**
   * Drawable area in CSS pixels, including bleed on all four sides. Both
   * contexts are already translated so that (0, 0) is the box's top-left
   * corner, and everything below draws in box-local coordinates.
   */
  width: number;
  height: number;
  bleed: number;
}

interface LitFacet {
  path: FacetPath;
  color: Rgb;
  alpha: number;
  glint: number;
}

export function renderFrame(input: FrameInput): void {
  const { ctx, layer, facets, paths, clip, palette, options, style, time } =
    input;
  const { bleed, width, height } = input;

  const sample: FacetSample = createSample(palette.length);

  ctx.clearRect(-bleed, -bleed, width, height);
  ctx.globalCompositeOperation = "lighter";

  // Evaluate every facet once, then draw the passes from the cached values.
  const lit: LitFacet[] = [];
  for (let i = 0; i < facets.length; i++) {
    const s = sampleFacet(facets[i], time, options, palette.length, sample);
    if (s.total <= 0.002 && s.glint <= 0.002) continue;
    lit.push({
      path: paths[i],
      color: mixPalette(palette, s.weights),
      alpha: Math.min(1, s.total),
      glint: s.glint,
    });
  }

  if (lit.length === 0) {
    ctx.globalCompositeOperation = "source-over";
    return;
  }

  /** Stroke every lit facet into `target` at one line width. */
  const strokeAll = (
    target: CanvasRenderingContext2D,
    lineWidth: number,
    alphaScale: number,
  ) => {
    target.lineCap = "round";
    target.lineJoin = "round";
    target.lineWidth = lineWidth;
    for (const item of lit) {
      target.strokeStyle = rgba(item.color, item.alpha * alphaScale);
      tracePath(target, item.path);
      target.stroke();
    }
  };

  /**
   * Draw one pass into the offscreen layer, then composite it back through a
   * single blur. `clipTo` keeps the spill inside the box.
   */
  const blurredPass = (
    lineWidth: number,
    alphaScale: number,
    blur: number,
    clipTo?: Path2D,
  ) => {
    if (!layer) return;
    layer.globalCompositeOperation = "source-over";
    layer.clearRect(-bleed, -bleed, width, height);
    layer.globalCompositeOperation = "lighter";
    strokeAll(layer, lineWidth, alphaScale);

    ctx.save();
    if (clipTo) ctx.clip(clipTo);
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(layer.canvas, -bleed, -bleed, width, height);
    ctx.restore();
  };

  if (style.glow > 0) {
    if (style.spill > 0) {
      blurredPass(
        style.thickness * 14,
        0.22 * style.spill,
        style.glow * 2.2,
        clip,
      );
    }
    // The atmosphere outside the box. This is what `bleed` makes room for.
    blurredPass(style.thickness * HALO_WIDTH, 0.22, style.glow * HALO_BLUR);
    blurredPass(style.thickness * 2.8, 0.6, style.glow);
  }

  ctx.filter = "none";
  strokeAll(ctx, style.thickness, 1);

  // Glint: a short, very bright white core on the facets that are cut steepest.
  ctx.lineWidth = Math.max(0.6, style.thickness * 0.55);
  for (const item of lit) {
    if (item.glint <= 0.004) continue;
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, item.glint).toFixed(4)})`;
    tracePath(ctx, item.path);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = "source-over";
}

function rgba(c: Rgb, alpha: number): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha.toFixed(4)})`;
}
