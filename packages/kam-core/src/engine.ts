/**
 * The Facet engine.
 *
 * The rim of a box is treated as the girdle of a cut gem: it is divided into
 * discrete facets, each given a deterministic micro-tilt, and lit by a single
 * light whose azimuth rotates slowly. A facet flares when its tilted normal
 * lines up with the light, so light does not sweep smoothly around the border —
 * it scatters, catching some facets early and others late, the way a real cut
 * stone does.
 *
 * Three chromatic samples are taken at slightly different light azimuths, which
 * pulls neighbouring palette colours apart into a prism fringe on either side
 * of each flare.
 *
 * Everything here is pure. Renderers call `sampleFacet` once per facet per
 * frame (canvas, SwiftUI) or bake a whole cycle up front (React Native).
 */

import { paletteWeights } from "./color.js";
import { createRim, type Rim, rimPointAt } from "./geometry.js";

const TAU = Math.PI * 2;

export interface FacetOptions {
  /** Number of facets around the rim. */
  facets: number;
  /** Light revolutions per second. Low is good; this is a slow shimmer. */
  speed: number;
  /** Specular exponent. Higher = tighter, harder glints. */
  sharpness: number;
  /** Weight of the broad, soft falloff that underlies the glints. */
  bloom: number;
  /**
   * Constant floor of light on every facet, regardless of where the light is
   * pointing.
   *
   * A facet only catches the light across half a turn, so without this the far
   * side of the rim emits nothing and the border stops existing there. Ambient
   * keeps the whole edge drawn — tinted, and drifting in hue with the light —
   * so the flares read as highlights on a border rather than as the border.
   * Set to 0 for a stark single-arc look.
   */
  ambient: number;
  /** Angular separation between chromatic samples, in radians. */
  dispersion: number;
  /** Number of chromatic samples. 1 disables dispersion. */
  samples: number;
  /** Maximum facet micro-tilt in radians. 0 = a smooth, un-faceted rim. */
  scatter: number;
  /**
   * How evenly facet orientations are spread around the rim, 0..1.
   *
   * A rounded rectangle keeps almost all of its normal-angle variation in the
   * four corner arcs — every facet along a straight edge shares one normal. At
   * `spread: 0` the light is tested against those true normals, so a whole edge
   * flares at once and the diagonals between edges go dark; how bad that looks
   * depends entirely on the box's aspect ratio. At `spread: 1` orientations are
   * distributed evenly by rim position instead, so how evenly the rim lights up
   * no longer depends on the shape at all — a wide banner and a tall tile
   * shimmer alike. The residual flicker that remains at `spread: 1` comes from
   * `scatter`, and is the point of the effect rather than an artefact.
   */
  spread: number;
  /** How much a facet's rim position shifts its palette lookup, in turns. */
  swirl: number;
  /** Strength of the white specular spike on sharply tilted facets. */
  glint: number;
  /** Depth of the slow whole-rim pulse, 0..1. */
  breath: number;
  /** Pulses per light revolution. Integer keeps the whole effect periodic. */
  breathCycles: number;
  /** Overall output multiplier. */
  intensity: number;
  /** Seed for the facet tilt/sparkle distribution. */
  seed: number;
}

export const defaultOptions: FacetOptions = {
  facets: 34,
  speed: 0.075,
  sharpness: 11,
  bloom: 0.22,
  ambient: 0.24,
  dispersion: 0.34,
  samples: 3,
  scatter: 0.5,
  spread: 0.85,
  swirl: 0.45,
  glint: 0.55,
  breath: 0.28,
  breathCycles: 2,
  intensity: 1,
  seed: 7,
};

export const defaultPalette: readonly string[] = [
  "#8b5cf6",
  "#22d3ee",
  "#f472b6",
];

export interface Facet {
  index: number;
  /** Arc-length span on the rim. */
  start: number;
  end: number;
  /** Midpoint of the span, and the outward normal there. */
  x: number;
  y: number;
  /** Outward normal angle at the midpoint, before tilt. */
  normal: number;
  /** Tilted normal angle — what the light actually tests against. */
  angle: number;
  /** Tangent angle, for renderers that place a rotated rectangle. */
  tangent: number;
  /** Normalised position around the rim, 0..1. */
  u: number;
  /** Per-facet sparkle weight, 0..1. Drives the white glint. */
  sparkle: number;
}

/** Deterministic hash -> [0, 1). Small, fast, and stable across platforms. */
function hash(n: number, seed: number): number {
  let x = (n * 374761393 + seed * 668265263) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  x = Math.imul(x, 1274126177) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

/** Cut the rim into facets. Pure geometry, recomputed only on resize. */
export function buildFacets(rim: Rim, options: FacetOptions): Facet[] {
  const count = Math.max(3, Math.round(options.facets));
  const step = rim.length / count;
  const out: Facet[] = [];

  for (let i = 0; i < count; i++) {
    const start = i * step;
    const end = start + step;
    const mid = rimPointAt(rim, start + step / 2);
    const tilt = (hash(i, options.seed) * 2 - 1) * options.scatter;
    const sparkleRaw = hash(i + 9973, options.seed);
    const u = i / count;

    // `rimPointAt` sweeps its normal angle monotonically from -PI/2 to 3PI/2
    // over one full walk, and so does the even distribution below, so the two
    // can simply be blended. See `spread`.
    const even = -Math.PI / 2 + u * TAU;
    const oriented = mid.angle + (even - mid.angle) * options.spread;

    out.push({
      index: i,
      start,
      end,
      x: mid.x,
      y: mid.y,
      normal: mid.angle,
      angle: oriented + tilt,
      // The tangent stays geometric — it is where the facet is drawn, not how
      // it is lit.
      tangent: mid.angle + Math.PI / 2,
      u,
      // Squared so most facets stay quiet and a few really pop.
      sparkle: sparkleRaw * sparkleRaw,
    });
  }

  return out;
}

export interface FacetSample {
  /** Per-palette-stop weight. Sums to the facet's total brightness. */
  weights: number[];
  /** White specular spike, already scaled by `glint`. */
  glint: number;
  /** Total brightness across all stops, before the glint is added. */
  total: number;
}

/** Scratch buffer reused inside `sampleFacet` to keep the hot path allocation-free. */
const scratch: number[] = [];

/**
 * Evaluate one facet at time `t` (seconds). `out.weights` must have one slot
 * per palette stop; it is overwritten, not accumulated into.
 */
export function sampleFacet(
  facet: Facet,
  t: number,
  options: FacetOptions,
  stops: number,
  out: FacetSample,
): FacetSample {
  const weights = out.weights;
  for (let i = 0; i < stops; i++) weights[i] = 0;
  while (scratch.length < stops) scratch.push(0);

  const revolutions = t * options.speed;
  const base = revolutions * TAU;
  const samples = Math.max(1, Math.round(options.samples));
  const share = 1 / samples;

  let total = 0;
  let glintAcc = 0;

  for (let k = 0; k < samples; k++) {
    // Chromatic samples straddle the light azimuth symmetrically.
    const offset = (k - (samples - 1) / 2) * options.dispersion;
    const phi = base + offset;

    const d = Math.cos(facet.angle - phi);
    if (d <= 0) continue;

    const spec = Math.pow(d, options.sharpness);
    const soft = d * d * options.bloom;
    const contribution = (spec + soft) * share;
    if (contribution <= 0) continue;

    paletteWeights(phi / TAU + facet.u * options.swirl, stops, scratch);
    for (let i = 0; i < stops; i++) weights[i] += contribution * scratch[i];
    total += contribution;
    glintAcc += spec * spec * spec * share;
  }

  // Ambient floor, coloured from the light's own position in the palette so the
  // unlit stretch of rim still drifts in hue rather than sitting flat.
  if (options.ambient > 0) {
    paletteWeights(base / TAU + facet.u * options.swirl, stops, scratch);
    for (let i = 0; i < stops; i++) weights[i] += options.ambient * scratch[i];
    total += options.ambient;
  }

  // Slow whole-rim pulse. Locked to the light revolution so the composite
  // animation stays periodic, which is what lets React Native bake it.
  const breathPhase = TAU * revolutions * options.breathCycles;
  const breath =
    1 - options.breath + options.breath * (0.5 + 0.5 * Math.cos(breathPhase));
  const gain = breath * options.intensity;

  for (let i = 0; i < stops; i++) weights[i] *= gain;

  out.total = total * gain;
  out.glint = glintAcc * facet.sparkle * options.glint * gain;
  return out;
}

export function createSample(stops: number): FacetSample {
  return { weights: new Array(stops).fill(0), glint: 0, total: 0 };
}

/**
 * Duration of one full loop of the animation, in seconds. `breathCycles` is an
 * integer multiple of the light revolution, so a single light revolution is the
 * period of the whole thing.
 */
export function cycleDuration(options: FacetOptions): number {
  const speed = Math.abs(options.speed);
  return speed > 1e-6 ? 1 / speed : 0;
}

export function resolveOptions(partial: Partial<FacetOptions>): FacetOptions {
  return { ...defaultOptions, ...stripUndefined(partial) };
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(input) as (keyof T)[]) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

export { createRim, rimPointAt };
export type { Rim };
