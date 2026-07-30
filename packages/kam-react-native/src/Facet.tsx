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
  type BakeResult,
  type FacetOptions,
  type PresetName,
  bakeCycle,
  buildFacets,
  createRim,
  defaultPalette,
  isPresetName,
  presets,
  resolveOptions,
} from "kam-core";

export interface FacetProps extends Partial<FacetOptions> {
  /** Named look. Individual options passed alongside it win. */
  preset?: PresetName;
  /** Palette, in the order the light travels through it. */
  colors?: string[];
  /** Corner radius of the rim. Match your container's `borderRadius`. */
  radius?: number;
  /** Core bar thickness. */
  thickness?: number;
  /**
   * Softening factor. React Native has no blur primitive here, so the halo is
   * approximated by a wider, dimmer bar behind each facet. 0 disables it.
   *
   * Those bars extend past the container's bounds, so keep the container's
   * `overflow` at its default `visible` unless you mean to crop the glow.
   */
  glow?: number;
  /** Freeze on a still frame. */
  paused?: boolean;
  /** Honour the OS "reduce motion" setting by freezing. Default true. */
  respectReduceMotion?: boolean;
  /**
   * Keyframes baked per cycle. Higher is smoother and costs memory; the default
   * is already smooth for the default speed.
   */
  steps?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * A prismatic, faceted light around the rim of its parent.
 *
 * The engine is the same one the web renderer uses, but React Native cannot
 * animate colour on the native driver — so a whole cycle is baked up front and
 * replayed as per-layer opacity interpolations off a single looping value. That
 * keeps the animation entirely on the native side: no per-frame JS, no bridge
 * traffic, and it survives a busy JS thread.
 *
 * ```tsx
 * <View style={{ borderRadius: 20, overflow: "visible" }}>
 *   <Facet preset="diamond" radius={20} />
 *   {children}
 * </View>
 * ```
 */
export function Facet(props: FacetProps) {
  const {
    preset,
    colors,
    radius = 20,
    thickness = 2,
    glow = 1,
    paused = false,
    respectReduceMotion = true,
    steps = 72,
    style,
    ...rest
  } = props;

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);
  const driver = useRef(new Animated.Value(0)).current;

  const presetDef = preset && isPresetName(preset) ? presets[preset] : undefined;

  const paletteKey = (colors ?? presetDef?.colors ?? defaultPalette).join("|");
  const palette = useMemo(() => paletteKey.split("|"), [paletteKey]);

  const optionsKey = JSON.stringify(
    resolveOptions({ ...presetDef?.options, ...rest }),
  );
  const options = useMemo(
    () => JSON.parse(optionsKey) as FacetOptions,
    [optionsKey],
  );

  const baked = useMemo<BakeResult | null>(() => {
    if (size.width < 2 || size.height < 2) return null;
    const rim = createRim(size.width, size.height, radius);
    const facets = buildFacets(rim, options);
    return bakeCycle(facets, options, palette.length, { steps });
  }, [size.width, size.height, radius, options, palette.length, steps]);

  useEffect(() => {
    if (!respectReduceMotion) return;
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduceMotion(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => setReduceMotion(value),
    );
    return () => {
      alive = false;
      sub?.remove();
    };
  }, [respectReduceMotion]);

  const still = paused || reduceMotion || !baked || baked.duration <= 0;

  useEffect(() => {
    if (!baked) return;
    if (still) {
      // A third of the way in: lit and asymmetric, unlike the flat t=0 pose.
      driver.setValue(1 / 3);
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

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const w = Math.round(width);
    const h = Math.round(height);
    setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  };

  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[StyleSheet.absoluteFill, style]}
    >
      {baked?.facets.map(({ facet, layers }) => {
        // Bars overlap slightly so the rim reads as continuous through corners.
        const span = facet.end - facet.start + thickness * 0.9;
        const rotation = `${facet.tangent}rad`;

        return layers.map((layer) => {
          const color = layer.stop < 0 ? "#ffffff" : palette[layer.stop];
          const isGlint = layer.stop < 0;
          const bar = isGlint ? thickness * 0.55 : thickness;
          const opacity = driver.interpolate({
            inputRange: baked.frames,
            outputRange: layer.values,
          });

          return (
            <React.Fragment key={`${facet.index}-${layer.stop}`}>
              {glow > 0 && !isGlint ? (
                <Animated.View
                  style={[
                    styles.bar,
                    {
                      width: span,
                      height: bar * (1 + 2.4 * glow),
                      borderRadius: bar * (1 + 2.4 * glow),
                      backgroundColor: color,
                      left: facet.x - span / 2,
                      top: facet.y - (bar * (1 + 2.4 * glow)) / 2,
                      transform: [{ rotate: rotation }],
                      opacity: Animated.multiply(opacity, 0.22),
                    },
                  ]}
                />
              ) : null}
              <Animated.View
                style={[
                  styles.bar,
                  {
                    width: span,
                    height: bar,
                    borderRadius: bar,
                    backgroundColor: color,
                    left: facet.x - span / 2,
                    top: facet.y - bar / 2,
                    transform: [{ rotate: rotation }],
                    opacity,
                  },
                ]}
              />
            </React.Fragment>
          );
        });
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
  },
});

export interface FacetCardProps extends FacetProps {
  children?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Convenience wrapper: a container with the facet rim already inside it.
 * Use `Facet` directly when you own the container.
 */
export function FacetCard({
  children,
  containerStyle,
  radius = 20,
  ...facetProps
}: FacetCardProps) {
  return (
    <View style={[{ borderRadius: radius }, containerStyle]}>
      <Facet radius={radius} {...facetProps} />
      {children}
    </View>
  );
}
