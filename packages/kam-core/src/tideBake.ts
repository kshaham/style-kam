/**
 * Pre-compute one cycle for the React Native renderer.
 *
 * Same trick `kam-core/bake.ts` uses for the facet rim: colour cannot be
 * animated on the native driver, so every stretch gets one solid-colour view
 * per palette stop plus a white one, and only their opacities are animated from
 * a single looping value.
 *
 * Only `processing` is bakeable — it is the only periodic state. `idle` is
 * slow enough to run in JS, and `done`/`error` are one-shot transitions best
 * expressed as timing curves at the call site.
 */

import {
  type Stretch,
  type TideOptions,
  type TideGeometry,
  cycleDuration,
  sampleStretch,
} from "./tide.js";

export interface BakedStretch {
  stretch: Stretch;
  /** Opacity curves, one per palette stop; the last entry is white. */
  curves: number[][];
  /** Per-curve peak, so layers that never light can be dropped. */
  peaks: number[];
  /** Line-width curve, from `crest`. */
  width: number[];
}

export interface TideBake {
  duration: number;
  frames: number[];
  stretches: BakedStretch[];
}

export function bakeTide(
  stretches: readonly Stretch[],
  options: TideOptions,
  geo: TideGeometry,
  stops: number,
  steps = 64,
  epsilon = 0.012,
): TideBake {
  const duration = cycleDuration(options);
  const frames: number[] = [];
  for (let i = 0; i <= steps; i++) frames.push(i / steps);

  const out: BakedStretch[] = [];
  for (const stretch of stretches) {
    const curves: number[][] = [];
    for (let i = 0; i <= stops; i++) curves.push(new Array(steps + 1).fill(0));
    const width = new Array(steps + 1).fill(0);

    for (let step = 0; step <= steps; step++) {
      // The last keyframe repeats the first so the loop closes seamlessly.
      const t = duration * ((step % steps) / steps);
      const s = sampleStretch(stretch.x, stretch.y, t, "processing", options, geo);
      // `u` only ever lights two adjacent stops, so summing the stop layers
      // reproduces the mixed colour the canvas renderer computes directly.
      const scaled = ((s.u % 1) + 1) % 1 * stops;
      const lo = Math.floor(scaled) % stops;
      const hi = (lo + 1) % stops;
      const f = scaled - Math.floor(scaled);
      curves[lo][step] += s.alpha * (1 - f);
      curves[hi][step] += s.alpha * f;
      curves[stops][step] = s.white;
      width[step] = 0.85 + 0.9 * s.crest;
    }

    const peaks = curves.map((c) => c.reduce((a, b) => (b > a ? b : a), 0));
    if (peaks.some((p) => p >= epsilon)) out.push({ stretch, curves, peaks, width });
  }

  return { duration, frames, stretches: out };
}
