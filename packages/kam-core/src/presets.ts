/**
 * Named looks. Each is a palette plus the engine settings that make that
 * palette read the way it is supposed to — a hard, icy stone needs a different
 * specular exponent from a soft, smouldering one.
 */

import type { FacetOptions } from "./engine.js";

export interface Preset {
  colors: string[];
  options: Partial<FacetOptions>;
}

export const presets = {
  /** The default. Cool violet through cyan, with a warm pink flare. */
  prism: {
    colors: ["#8b5cf6", "#22d3ee", "#f472b6"],
    options: {},
  },
  /** Hard, high-contrast white-blue. Few facets lit at once. */
  diamond: {
    colors: ["#e0f2fe", "#7dd3fc", "#c4b5fd", "#ffffff"],
    options: {
      sharpness: 18,
      scatter: 0.62,
      glint: 0.9,
      bloom: 0.14,
      ambient: 0.16,
      dispersion: 0.28,
      breath: 0.18,
    },
  },
  /** Slow, molten, low glint. Reads as heat rather than sparkle. */
  ember: {
    colors: ["#f97316", "#facc15", "#dc2626"],
    options: {
      sharpness: 6,
      scatter: 0.34,
      bloom: 0.34,
      ambient: 0.3,
      glint: 0.22,
      speed: 0.05,
      breath: 0.42,
      dispersion: 0.22,
    },
  },
  /** Wide, drifting green-teal curtain. Barely faceted. */
  aurora: {
    colors: ["#34d399", "#22d3ee", "#a78bfa", "#4ade80"],
    options: {
      sharpness: 3.5,
      scatter: 0.2,
      bloom: 0.55,
      ambient: 0.34,
      glint: 0.14,
      speed: 0.045,
      swirl: 0.9,
      breath: 0.36,
      dispersion: 0.5,
    },
  },
  /** Monochrome, restrained. For interfaces that cannot afford colour. */
  graphite: {
    colors: ["#f8fafc", "#94a3b8", "#cbd5e1"],
    options: {
      sharpness: 14,
      scatter: 0.55,
      glint: 0.4,
      bloom: 0.16,
      ambient: 0.2,
      breath: 0.2,
      dispersion: 0.16,
    },
  },
} satisfies Record<string, Preset>;

export type PresetName = keyof typeof presets;

export function isPresetName(value: string): value is PresetName {
  return Object.prototype.hasOwnProperty.call(presets, value);
}
