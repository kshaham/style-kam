import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import {
  type Stretch,
  type TideBake,
  type TideOptions,
  type TidePresetName,
  type TideState,
  bakeTide,
  buildStretches,
  createRim,
  isTidePreset,
  resolveGeometry,
  resolveTideOptions,
  mixPalette,
  parsePalette,
  rimPointAt,
  sampleStretch,
  tidePalettes,
  tidePresets,
} from "kam-core";

export interface TideProps extends Partial<TideOptions> {
  /** Lifecycle. The clock restarts whenever this changes. */
  state?: TideState;
  /** Named tuning. Individual options passed alongside it win. */
  preset?: TidePresetName;
  /** Palette override; defaults to the palette for `state`. */
  colors?: readonly string[];
  /** Corner radius. Match your container's `borderRadius`. */
  radius?: number;
  /** Core bar thickness. */
  thickness?: number;
  /**
   * Softening factor. React Native has no blur primitive here, so the halo is
   * approximated by a wider, dimmer bar behind each stretch. 0 disables it.
   *
   * Those bars extend past the container's bounds, so leave the container's
   * `overflow` at its default `visible` unless you mean to crop the glow.
   */
  glow?: number;
  /**
   * Rim sampling step, in points. The web renderer uses 6; on device every
   * stretch becomes a stack of real views, so the default here is coarser.
   * Lower it for a finer rim at the cost of view count.
   */
  step?: number;
  /** Hard cap on stretches, so a very large card cannot explode the view tree. */
  maxStretches?: number;
  /** Keyframes baked per cycle. */
  steps?: number;
  /**
   * Colour layers kept per stretch.
   *
   * Every layer is a real view on device, and the full four-stop palette costs
   * roughly 500 views on an ordinary card — enough to stutter on mid-range
   * Android. Two keeps the cyan-above / magenta-below split that carries the
   * effect while cutting the tree by more than half. Raise it for fidelity on
   * a small element; the web renderer always uses the full palette.
   */
  maxLayers?: number;
  /** Honour the OS "reduce motion" setting by freezing at the kiss. */
  respectReduceMotion?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Tide for React Native.
 *
 * `processing` is periodic, so a whole cycle is baked up front and replayed as
 * per-layer opacity interpolations off one looping `Animated.Value` — the
 * native driver cannot animate colour, but it handles opacity, so nothing about
 * the animation depends on the JS thread staying free.
 *
 * The other three states are not periodic. `idle` breathes slowly enough to
 * drive from a long looping value, and `done` / `error` are one-shot
 * transitions, so all three are rendered as a single sampled pose that is
 * re-sampled on a slow timer rather than baked.
 *
 * ```tsx
 * <View style={{ borderRadius: 20 }}>
 *   <Tide state={saving ? "processing" : "idle"} radius={20} />
 *   {children}
 * </View>
 * ```
 */
export function Tide(props: TideProps) {
  const {
    state = "processing",
    preset,
    colors,
    radius = 20,
    thickness = 2,
    glow = 1,
    step = 16,
    maxStretches = 96,
    steps = 64,
    maxLayers = 2,
    respectReduceMotion = true,
    style,
    ...rest
  } = props;

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);
  const driver = useRef(new Animated.Value(0)).current;

  const presetOptions = preset && isTidePreset(preset) ? tidePresets[preset] : undefined;
  const optionsKey = JSON.stringify(resolveTideOptions({ ...presetOptions, ...rest }));
  const options = useMemo(() => JSON.parse(optionsKey) as TideOptions, [optionsKey]);

  const paletteKey = [...(colors ?? tidePalettes[state])].join("|");
  const palette = useMemo(() => paletteKey.split("|"), [paletteKey]);

  const scene = useMemo(() => {
    if (size.width < 2 || size.height < 2) return null;
    const rim = createRim(size.width, size.height, radius);
    let stretches = buildStretches(rim, step);
    if (stretches.length > maxStretches) {
      // Re-cut at a coarser step rather than dropping stretches, which would
      // leave gaps in the rim.
      stretches = buildStretches(rim, rim.length / maxStretches);
    }
    return { rim, stretches, geo: resolveGeometry(size.height, options) };
  }, [size.width, size.height, radius, step, maxStretches, options]);

  const baked = useMemo(() => {
    if (!scene || state !== "processing") return null;
    const raw = bakeTide(scene.stretches, options, scene.geo, palette.length, steps);
    return collapse(raw, palette, maxLayers);
  }, [scene, state, options, palette, steps, maxLayers]);

  useEffect(() => {
    if (!respectReduceMotion) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) =>
      setReduceMotion(v),
    );
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [respectReduceMotion]);

  const still = reduceMotion || !baked || baked.duration <= 0;

  useEffect(() => {
    if (!baked) return;
    if (still) {
      // Freeze at the kiss — the most legible single frame.
      driver.setValue(0.6);
      return;
    }
    driver.setValue(0);
    const animation = Animated.loop(
      Animated.timing(driver, {
        toValue: 1,
        duration: baked.duration * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [baked, still, driver]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const w = Math.round(width);
    const h = Math.round(height);
    setSize((p) => (p.width === w && p.height === h ? p : { width: w, height: h }));
  };

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[StyleSheet.absoluteFill, style]}
    >
      {baked
        ? baked.stretches.map((entry) =>
            renderBakedStretch({
              entry,
              frames: baked.frames,
              driver,
              thickness,
              glow,
              rim: scene!.rim,
            }),
          )
        : scene
          ? renderStaticPose({
              scene,
              state,
              options,
              palette,
              thickness,
              glow,
            })
          : null}
    </View>
  );
}

/** Geometry shared by both render paths: where one stretch's bar sits. */
function barFor(rim: Parameters<typeof rimPointAt>[0], stretch: Stretch, thickness: number) {
  const mid = rimPointAt(rim, (stretch.s0 + stretch.s1) / 2);
  // Overlap neighbours slightly so the rim reads as continuous through corners.
  const span = stretch.s1 - stretch.s0 + thickness * 0.9;
  return {
    span,
    left: mid.x - span / 2,
    top: mid.y,
    // The tangent is the outward normal turned a quarter turn.
    rotate: `${mid.angle + Math.PI / 2}rad`,
  };
}

/** One solid-colour layer of a stretch: a colour plus its opacity curve. */
interface Layer {
  color: string;
  curve: number[];
  peak: number;
  /** White layers are drawn thinner and never get a halo. */
  white: boolean;
}

interface CollapsedStretch {
  stretch: Stretch;
  layers: Layer[];
}

interface CollapsedBake {
  duration: number;
  frames: number[];
  stretches: CollapsedStretch[];
}

/**
 * Collapse the baked per-stop curves into at most `maxLayers` colour layers.
 *
 * Every layer becomes a real view on device. Keeping one per palette stop
 * costs around eight views per stretch — roughly 500 on an ordinary card —
 * which is more than React Native should be asked to composite. The stops with
 * the highest peaks become anchors, every other stop folds into its nearest
 * anchor around the palette ring, and the anchor's colour becomes the
 * peak-weighted mix of what it absorbed. Curves are summed, which is correct
 * because the layers composite additively over a dark ground.
 */
function collapse(bake: TideBake, palette: string[], maxLayers: number): CollapsedBake {
  const stops = palette.length;
  const rgb = parsePalette(palette);
  const keep = Math.max(1, Math.min(maxLayers, stops));

  const stretches: CollapsedStretch[] = bake.stretches.map(({ stretch, curves, peaks }) => {
    const order = [...Array(stops).keys()].sort((a, b) => peaks[b] - peaks[a]);
    const anchors = order.slice(0, keep).filter((i) => peaks[i] > 0);
    if (anchors.length === 0) return { stretch, layers: [] };

    const merged = anchors.map((i) => ({
      curve: curves[i].slice(),
      weights: new Array(stops).fill(0).map((_, k) => (k === i ? peaks[i] : 0)),
    }));

    for (let i = 0; i < stops; i++) {
      if (anchors.includes(i) || peaks[i] <= 0) continue;
      // Nearest anchor around the ring, since the palette wraps.
      let best = 0;
      let bestDist = Infinity;
      anchors.forEach((a, k) => {
        const raw = Math.abs(a - i);
        const d = Math.min(raw, stops - raw);
        if (d < bestDist) { bestDist = d; best = k; }
      });
      for (let f = 0; f < merged[best].curve.length; f++) merged[best].curve[f] += curves[i][f];
      merged[best].weights[i] += peaks[i];
    }

    const layers: Layer[] = merged.map((m) => {
      const mixed = mixPalette(rgb, m.weights);
      return {
        color: `rgb(${Math.round(mixed.r)}, ${Math.round(mixed.g)}, ${Math.round(mixed.b)})`,
        curve: m.curve,
        peak: m.curve.reduce((a, b) => (b > a ? b : a), 0),
        white: false,
      };
    });

    const whiteCurve = curves[stops];
    const whitePeak = whiteCurve.reduce((a, b) => (b > a ? b : a), 0);
    if (whitePeak >= 0.012) {
      layers.push({ color: "#ffffff", curve: whiteCurve, peak: whitePeak, white: true });
    }

    return { stretch, layers: layers.filter((l) => l.peak >= 0.012) };
  });

  return {
    duration: bake.duration,
    frames: bake.frames,
    stretches: stretches.filter((s) => s.layers.length > 0),
  };
}

interface BakedArgs {
  entry: CollapsedStretch;
  frames: number[];
  driver: Animated.Value;
  thickness: number;
  glow: number;
  rim: Parameters<typeof rimPointAt>[0];
}

function renderBakedStretch(a: BakedArgs) {
  const bar = barFor(a.rim, a.entry.stretch, a.thickness);
  const nodes: React.ReactNode[] = [];

  a.entry.layers.forEach((layer, i) => {
    const core = layer.white ? a.thickness * 0.5 : a.thickness;
    const opacity = a.driver.interpolate({
      inputRange: a.frames,
      outputRange: layer.curve.map((v) => Math.min(1, v)),
    });

    // One halo, on the brightest colour layer only — a halo per layer would
    // double the tree for a glow nobody can distinguish.
    if (a.glow > 0 && !layer.white && i === 0) {
      const halo = core * (1 + 2.4 * a.glow);
      nodes.push(
        <Animated.View
          key={`h${i}`}
          style={[
            styles.bar,
            {
              width: bar.span,
              height: halo,
              borderRadius: halo,
              backgroundColor: layer.color,
              left: bar.left,
              top: bar.top - halo / 2,
              transform: [{ rotate: bar.rotate }],
              opacity: Animated.multiply(opacity, 0.2),
            },
          ]}
        />,
      );
    }

    nodes.push(
      <Animated.View
        key={i}
        style={[
          styles.bar,
          {
            width: bar.span,
            height: core,
            borderRadius: core,
            backgroundColor: layer.color,
            left: bar.left,
            top: bar.top - core / 2,
            transform: [{ rotate: bar.rotate }],
            opacity,
          },
        ]}
      />,
    );
  });

  return <React.Fragment key={a.entry.stretch.s0}>{nodes}</React.Fragment>;
}

interface StaticArgs {
  scene: { rim: Parameters<typeof rimPointAt>[0]; stretches: Stretch[]; geo: ReturnType<typeof resolveGeometry> };
  state: TideState;
  options: TideOptions;
  palette: string[];
  thickness: number;
  glow: number;
}

/**
 * `idle`, `done` and `error` are not periodic, so there is nothing to bake.
 * They are drawn as one sampled pose; `done` and `error` are transitions the
 * call site is expected to hold only briefly.
 */
function renderStaticPose(a: StaticArgs) {
  const out: React.ReactNode[] = [];
  const stops = a.palette.length;

  for (const stretch of a.scene.stretches) {
    const s = sampleStretch(stretch.x, stretch.y, 0.35, a.state, a.options, a.scene.geo);
    if (s.alpha <= 0.004) continue;

    const scaled = (((s.u % 1) + 1) % 1) * stops;
    const lo = Math.floor(scaled) % stops;
    const f = scaled - Math.floor(scaled);
    // Only ever two adjacent stops are lit, so the brighter one is a faithful
    // stand-in when a single solid colour is all that is available.
    const color = a.palette[f > 0.5 ? (lo + 1) % stops : lo];

    const bar = barFor(a.scene.rim, stretch, a.thickness);
    const core = a.thickness * (0.85 + 0.9 * s.crest);
    out.push(
      <View
        key={stretch.s0}
        style={[
          styles.bar,
          {
            width: bar.span,
            height: core,
            borderRadius: core,
            backgroundColor: color,
            left: bar.left,
            top: bar.top - core / 2,
            transform: [{ rotate: bar.rotate }],
            opacity: Math.min(0.95, s.alpha),
          },
        ]}
      />,
    );
  }

  return out;
}

const styles = StyleSheet.create({
  bar: { position: "absolute" },
});

export interface TideCardProps extends TideProps {
  children?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Convenience wrapper: a container with the indicator already inside it. */
export function TideCard({
  children,
  containerStyle,
  radius = 20,
  ...tideProps
}: TideCardProps) {
  return (
    <View style={[{ borderRadius: radius }, containerStyle]}>
      <Tide radius={radius} {...tideProps} />
      {children}
    </View>
  );
}
