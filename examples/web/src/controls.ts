import type { FacetOptions } from "kam-core";

export interface ControlDef {
  key: keyof FacetOptions;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  /** Formatting for the readout. */
  digits?: number;
}

export interface ControlGroup {
  title: string;
  blurb: string;
  controls: ControlDef[];
}

export const controlGroups: ControlGroup[] = [
  {
    title: "The cut",
    blurb: "How the rim is divided and how each facet is angled.",
    controls: [
      {
        key: "facets",
        label: "facets",
        min: 6,
        max: 96,
        step: 1,
        digits: 0,
        hint: "Segments around the rim. Fewer reads as chunky crystal, more as fine glitter.",
      },
      {
        key: "scatter",
        label: "scatter",
        min: 0,
        max: 1.2,
        step: 0.01,
        hint: "Micro-tilt on each facet. At 0 the rim is smooth and the light just sweeps.",
      },
      {
        key: "spread",
        label: "spread",
        min: 0,
        max: 1,
        step: 0.01,
        hint: "At 0, facets are lit by the box's true normals — whole edges flare at once and the diagonals go dark. At 1 they are spread evenly, so any aspect ratio shimmers alike.",
      },
      {
        key: "seed",
        label: "seed",
        min: 0,
        max: 40,
        step: 1,
        digits: 0,
        hint: "Re-rolls which facets are tilted which way. Same seed, same stone.",
      },
    ],
  },
  {
    title: "The light",
    blurb: "One rotating source, and how sharply facets answer it.",
    controls: [
      {
        key: "speed",
        label: "speed",
        min: 0,
        max: 0.4,
        step: 0.005,
        digits: 3,
        hint: "Revolutions per second. 0 freezes the stone.",
      },
      {
        key: "sharpness",
        label: "sharpness",
        min: 1,
        max: 30,
        step: 0.5,
        digits: 1,
        hint: "Specular exponent. High is hard and jewel-like, low is a soft wash.",
      },
      {
        key: "bloom",
        label: "bloom",
        min: 0,
        max: 0.8,
        step: 0.01,
        hint: "Broad falloff under the glints, so the rim never fully disappears.",
      },
      {
        key: "ambient",
        label: "ambient",
        min: 0,
        max: 0.7,
        step: 0.01,
        hint: "Constant floor on every facet. At 0 the far half of the rim emits nothing and the border stops existing there.",
      },
      {
        key: "glint",
        label: "glint",
        min: 0,
        max: 1.5,
        step: 0.01,
        hint: "White spike on the facets cut steepest. This is the sparkle.",
      },
    ],
  },
  {
    title: "The colour",
    blurb: "How the palette is pulled apart across each flare.",
    controls: [
      {
        key: "dispersion",
        label: "dispersion",
        min: 0,
        max: 1.2,
        step: 0.01,
        hint: "Angle between the chromatic samples. This is the prism fringe.",
      },
      {
        key: "samples",
        label: "samples",
        min: 1,
        max: 6,
        step: 1,
        digits: 0,
        hint: "How many chromatic samples per facet. 1 turns dispersion off entirely.",
      },
      {
        key: "swirl",
        label: "swirl",
        min: 0,
        max: 2,
        step: 0.01,
        hint: "How far a facet's position shifts its palette lookup, so colour varies around the rim as well as over time.",
      },
    ],
  },
  {
    title: "The pulse",
    blurb: "The slow breath under everything.",
    controls: [
      {
        key: "breath",
        label: "breath",
        min: 0,
        max: 1,
        step: 0.01,
        hint: "Depth of the whole-rim swell.",
      },
      {
        key: "breathCycles",
        label: "breathCycles",
        min: 1,
        max: 8,
        step: 1,
        digits: 0,
        hint: "Swells per revolution. Whole numbers keep the loop seamless.",
      },
      {
        key: "intensity",
        label: "intensity",
        min: 0.2,
        max: 2.5,
        step: 0.05,
        digits: 2,
        hint: "Overall gain.",
      },
    ],
  },
];

export function formatValue(def: ControlDef, value: number): string {
  const digits = def.digits ?? 2;
  return value.toFixed(digits);
}
