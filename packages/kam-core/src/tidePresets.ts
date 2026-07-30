/**
 * Reviewed Tide tunings.
 *
 * These came out of the mobile review rather than being invented here — the
 * numbers are the ones that were actually looked at on a device.
 */

import type { TideOptions } from "./tide.js";

export const tidePresets = {
  /**
   * Wide, slow and low-contrast. For long operations that should not invite
   * being watched.
   */
  calm: { band: 1.7, reach: 0.5, kiss: 0.65, speed: 0.62 },
  /**
   * Thin core, tight glow, quick cycle. The one to reach for on short
   * operations, where the kiss needs to land before attention moves on.
   */
  precise: { band: 0.55, kiss: 1.5, speed: 1.45 },
  /**
   * Wide bloom, full spill, and enough `cross` that the fronts overshoot each
   * other rather than merely touching. The most physical of the three.
   */
  deep: { band: 1.15, cross: 0.17, kiss: 1.1, speed: 0.9 },
} satisfies Record<string, Partial<TideOptions>>;

export type TidePresetName = keyof typeof tidePresets;

export function isTidePreset(name: string): name is TidePresetName {
  return Object.prototype.hasOwnProperty.call(tidePresets, name);
}
