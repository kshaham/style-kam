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

// ---------------------------------------------------------------- Tide ----

export {
  buildStretches,
  cycleDuration as tideCycleDuration,
  defaultOptions as tideDefaultOptions,
  levels as tideLevels,
  palettes as tidePalettes,
  resolveGeometry,
  resolveOptions as resolveTideOptions,
  sampleStretch,
  type Stretch,
  type TideGeometry,
  type TideOptions,
  type TideSample,
  type TideState,
} from "./tide.js";

export {
  bakeTide,
  type BakedStretch,
  type TideBake,
} from "./tideBake.js";

export {
  isTidePreset,
  tidePresets,
  type TidePresetName,
} from "./tidePresets.js";
