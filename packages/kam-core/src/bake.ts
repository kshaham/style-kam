/**
 * Pre-compute a whole animation cycle.
 *
 * React Native cannot animate colour on the native driver, and running the
 * engine in JS every frame would put the effect at the mercy of the bridge. So
 * instead the renderer gives every palette stop its own solid-colour layer and
 * animates only its opacity — which the native driver does handle — driven by a
 * single looping `Animated.Value`.
 *
 * That works because `paletteWeights` only ever lights two adjacent stops at a
 * time: summing the stop layers reproduces the mixed colour the canvas renderer
 * computes directly. This module bakes the opacity curves those layers need.
 */

import {
  type Facet,
  type FacetOptions,
  createSample,
  cycleDuration,
  sampleFacet,
} from "./engine.js";

export interface BakedLayer {
  /** Index into the palette, or -1 for the white glint layer. */
  stop: number;
  /** Opacity samples across one cycle, length `steps + 1` (first == last). */
  values: number[];
  /** Largest value in `values`; layers that never light up are dropped. */
  peak: number;
}

export interface BakedFacet {
  facet: Facet;
  layers: BakedLayer[];
}

export interface BakeResult {
  /** Seconds for one loop of the looping driver value. */
  duration: number;
  /** Normalised keyframe positions, 0..1, shared by every layer. */
  frames: number[];
  facets: BakedFacet[];
}

export interface BakeConfig {
  /** Keyframes per cycle. More is smoother and costs interpolation memory. */
  steps?: number;
  /** Layers whose peak opacity falls below this are dropped entirely. */
  epsilon?: number;
  /** Ceiling applied to every opacity, since alpha cannot exceed 1. */
  maxOpacity?: number;
}

export function bakeCycle(
  facets: readonly Facet[],
  options: FacetOptions,
  stops: number,
  config: BakeConfig = {},
): BakeResult {
  const steps = Math.max(8, Math.round(config.steps ?? 64));
  const epsilon = config.epsilon ?? 0.012;
  const maxOpacity = config.maxOpacity ?? 1;
  const duration = cycleDuration(options);

  const frames: number[] = [];
  for (let i = 0; i <= steps; i++) frames.push(i / steps);

  const sample = createSample(stops);
  const baked: BakedFacet[] = [];

  for (const facet of facets) {
    // One curve per palette stop, plus one for the glint.
    const curves: number[][] = [];
    for (let i = 0; i <= stops; i++) curves.push(new Array(steps + 1).fill(0));

    for (let step = 0; step <= steps; step++) {
      // The last keyframe repeats the first so the loop closes seamlessly.
      const t = duration * ((step % steps) / steps);
      sampleFacet(facet, t, options, stops, sample);
      for (let i = 0; i < stops; i++) {
        curves[i][step] = clamp(sample.weights[i], 0, maxOpacity);
      }
      curves[stops][step] = clamp(sample.glint, 0, maxOpacity);
    }

    const layers: BakedLayer[] = [];
    for (let i = 0; i <= stops; i++) {
      const values = curves[i];
      const peak = values.reduce((a, b) => (b > a ? b : a), 0);
      if (peak < epsilon) continue;
      layers.push({ stop: i === stops ? -1 : i, values, peak });
    }

    if (layers.length > 0) baked.push({ facet, layers });
  }

  return { duration, frames, facets: baked };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}
