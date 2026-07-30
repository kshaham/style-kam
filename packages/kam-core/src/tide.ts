/**
 * The Tide engine.
 *
 * Two waterlines travel toward the middle of the rim: `lower` climbs from
 * beneath the bottom edge, `upper` descends from above the top edge. Each
 * carries a meniscus — a narrow band of much brighter colour — and leaves a dim
 * body of colour behind it. The rim between them stays faintly lit so the
 * border never stops existing.
 *
 * Everything here is pure. The canvas renderer calls `sampleStretch` once per
 * rim stretch per frame; React Native bakes a whole cycle up front.
 */

import { type Rim, rimPointAt } from "./geometry.js";

export type TideState = "idle" | "processing" | "done" | "error";

export interface TideOptions {
  /** Cycles per second. One cycle is close, kiss, withdraw. */
  speed: number;
  /** Meniscus thickness, as a multiple of 5.5% of the box height. */
  band: number;
  /** How far each front travels, in box heights. */
  reach: number;
  /** Extra travel past the middle, so the fronts overshoot each other. */
  cross: number;
  /** Strength of the flash thrown when the fronts pass. */
  kiss: number;
  /** Output multiplier. */
  intensity: number;
}

export const defaultOptions: TideOptions = {
  speed: 1,
  band: 1,
  reach: 0.56,
  cross: 0,
  kiss: 1,
  intensity: 1,
};

/** Working palette per state. Terminal states carry their own meaning. */
export const palettes: Record<TideState, readonly string[]> = {
  idle: ["#22d3ee", "#818cf8", "#f0abfc", "#fda4af"],
  processing: ["#22d3ee", "#818cf8", "#f0abfc", "#fda4af"],
  done: ["#34d399", "#a7f3d0", "#22d3ee"],
  error: ["#fb7185", "#fdba74", "#f43f5e"],
};

/** One cycle in seconds. `bake` needs this to close its loop seamlessly. */
export function cycleDuration(options: TideOptions): number {
  const speed = Math.abs(options.speed);
  return speed > 1e-6 ? 3.6 / speed : 0;
}

export interface TideGeometry {
  /** Box height in CSS pixels — the axis both fronts travel along. */
  height: number;
  /** Meniscus half-thickness in pixels, derived from `band`. */
  band: number;
}

export function resolveGeometry(height: number, options: TideOptions): TideGeometry {
  return { height, band: Math.max(6, height * 0.055 * options.band) };
}

/**
 * Front positions at time `t`, in box-local y.
 *
 * The approach is fast and the withdrawal is eased, because a slow separation
 * looks like failure while a slow approach looks like effort.
 */
export function levels(t: number, options: TideOptions, geo: TideGeometry) {
  const phase = (t / cycleDuration(options)) % 1;
  const settle =
    phase < 0.6
      ? 1 - Math.pow(1 - phase / 0.6, 3)
      : 1 - (0.5 - 0.5 * Math.cos(Math.PI * (phase - 0.6) / 0.4));
  const travel = geo.height * (options.reach + options.cross) * settle;
  const lower = geo.height * 1.06 - travel;
  const upper = -geo.height * 0.06 + travel;
  // Squared so the flash is confined to the moment of passing.
  const kiss =
    Math.pow(Math.max(0, 1 - Math.abs(lower - upper) / (geo.band * 2.4)), 2) *
    options.kiss;
  return { lower, upper, kiss, settle };
}

export interface TideSample {
  /** Palette lookup position, in turns. */
  u: number;
  /** 0..1 — how close this stretch is to a meniscus. Drives line width. */
  crest: number;
  /** Colour opacity for the stretch. */
  alpha: number;
  /** White opacity laid over the crest. */
  white: number;
}

/**
 * Evaluate the stretch of rim whose midpoint is (x, y).
 *
 * `state` replaces the travelling fronts with their lifecycle equivalents:
 * parked at the edges while idle, merged and radiating on success, held and
 * flashing on failure. `t` restarts at 0 on every state change.
 */
export function sampleStretch(
  x: number,
  y: number,
  t: number,
  state: TideState,
  options: TideOptions,
  geo: TideGeometry,
): TideSample {
  const H = geo.height;
  const gain = options.intensity;
  const mid = H / 2;

  if (state === "idle") {
    const breath = 0.5 + 0.5 * Math.cos(t * 0.85);
    const edge = Math.max(0, 1 - Math.min(y, H - y) / (H * 0.3));
    return {
      u: (y / H) * 0.3 + 0.05,
      crest: 0,
      alpha: (0.055 + 0.1 * edge * (0.55 + 0.45 * breath)) * gain,
      white: 0,
    };
  }

  if (state === "done") {
    const spread = Math.min(1.25, t * 1.9);
    const hold = 0.17 + 0.045 * Math.sin(t * 1.05);
    const dist = Math.abs(y - mid) / mid;
    const ring = Math.exp(-Math.pow((dist - spread) / 0.34, 2)) * Math.exp(-t * 1.5);
    const opening = Math.exp(-t * 3.4) * Math.max(0, 1 - dist * 4);
    const crest = Math.max(ring, opening);
    return {
      u: 0.1 + dist * 0.3 + t * 0.03,
      crest,
      alpha: (hold + 0.7 * crest) * gain,
      white: crest > 0.55 ? 0.55 * Math.pow(crest, 3) : 0,
    };
  }

  if (state === "error") {
    const flash = Math.min(
      1,
      Math.exp(-Math.pow((t - 0.07) / 0.1, 2)) + Math.exp(-Math.pow((t - 0.33) / 0.1, 2)),
    );
    return {
      u: 0.05 + (y / H) * 0.35,
      crest: 0.5 * flash,
      alpha: (0.18 + 0.03 * Math.sin(t * 2.4) + 0.5 * flash) * gain,
      white: 0,
    };
  }

  const { lower, upper, kiss } = levels(t, options, geo);
  // Two out-of-phase wobbles per front; horizontal position drives them so the
  // waterline ripples along its own length instead of shimmying as a unit.
  const wobA = Math.sin(x * 0.05 + t * 2.3) * 2.4 + Math.sin(x * 0.018 - t * 1.4) * 3.2;
  const wobB = Math.sin(x * 0.043 - t * 2.0) * 2.4 + Math.sin(x * 0.021 + t * 1.2) * 3.2;
  const dLower = y - (lower + wobA);
  const dUpper = (upper + wobB) - y;
  const cLower = Math.max(0, 1 - Math.abs(dLower) / geo.band);
  const cUpper = Math.max(0, 1 - Math.abs(dUpper) / geo.band);
  const body = (dLower > 0 ? 0.2 : 0) + (dUpper > 0 ? 0.2 : 0);
  const crest = Math.max(cLower, cUpper);
  const both = cLower > 0.35 && cUpper > 0.35;

  return {
    u: (dUpper > 0 ? 0.55 : 0.05) + (y / H) * 0.32 + t * 0.05,
    crest,
    alpha:
      (0.05 + body + 0.78 * (cLower * cLower + cUpper * cUpper) + 0.3 * kiss * crest) * gain,
    white: both && kiss > 0.05 ? Math.min(1, 0.7 * kiss) : crest > 0.55 ? 0.55 * Math.pow(crest, 3) : 0,
  };
}

export interface Stretch {
  /** Arc-length bounds on the rim. */
  s0: number;
  s1: number;
  /** Midpoint, in box-local coordinates. */
  x: number;
  y: number;
}

/** Cut the rim into stretches ~6px long. Recomputed only on resize. */
export function buildStretches(rim: Rim, step = 6): Stretch[] {
  const count = Math.max(24, Math.ceil(rim.length / step));
  const out: Stretch[] = [];
  for (let i = 0; i < count; i++) {
    const s0 = (i * rim.length) / count;
    const s1 = ((i + 1) * rim.length) / count;
    const p = rimPointAt(rim, (s0 + s1) / 2);
    out.push({ s0, s1, x: p.x, y: p.y });
  }
  return out;
}

export function resolveOptions(partial: Partial<TideOptions>): TideOptions {
  const out = { ...defaultOptions };
  for (const key of Object.keys(partial) as (keyof TideOptions)[]) {
    const value = partial[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
