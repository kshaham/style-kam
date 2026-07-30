export {
  angleDelta,
  createRim,
  rimPointAt,
  type Rim,
  type RimPoint,
} from "./geometry.js";

export {
  mixPalette,
  paletteWeights,
  parseColor,
  parsePalette,
  rgbaString,
  type Rgb,
} from "./color.js";

export {
  buildFacets,
  createSample,
  cycleDuration,
  defaultOptions,
  defaultPalette,
  resolveOptions,
  sampleFacet,
  type Facet,
  type FacetOptions,
  type FacetSample,
} from "./engine.js";

export {
  bakeCycle,
  type BakeConfig,
  type BakeResult,
  type BakedFacet,
  type BakedLayer,
} from "./bake.js";

export { isPresetName, presets, type Preset, type PresetName } from "./presets.js";
