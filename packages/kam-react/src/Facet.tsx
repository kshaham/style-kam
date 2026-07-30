import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type FacetOptions,
  type PresetName,
  buildFacets,
  createRim,
  cycleDuration,
  defaultPalette,
  isPresetName,
  parsePalette,
  presets,
  resolveOptions,
} from "kam-core";
import {
  type RenderStyle,
  buildClipPath,
  buildPaths,
  createLayer,
  haloExtent,
  renderFrame,
} from "./renderer.js";

export interface FacetProps extends Partial<FacetOptions> {
  /** Named look. Individual options passed alongside it win. */
  preset?: PresetName;
  /** Palette, in the order the light travels through it. */
  colors?: string[];
  /**
   * Corner radius of the rim, in CSS pixels. Defaults to the parent element's
   * computed `border-radius`, so it lines up without being told.
   */
  radius?: number;
  /** Core line width, in CSS pixels. */
  thickness?: number;
  /** Bloom blur radius, in CSS pixels. 0 turns the halo off. */
  glow?: number;
  /** Strength of the soft wash of colour across the surface inside, 0..1. */
  spill?: number;
  /**
   * How far the canvas extends beyond the box, in CSS pixels, so the outer
   * halo has somewhere to go. Defaults to the renderer's own halo reach, which
   * is what you want unless you are deliberately cropping.
   *
   * The canvas grows outward by this much and still paints the rim exactly on
   * the border, so nothing shifts — but an ancestor with `overflow: hidden`
   * will crop the halo back off.
   */
  bleed?: number;
  /** Freeze the animation on a still frame. */
  paused?: boolean;
  /**
   * What to do when the user has asked for reduced motion.
   * `still` (default) renders one frozen frame, `hide` renders nothing,
   * `animate` ignores the preference.
   */
  reducedMotion?: "still" | "hide" | "animate";
  className?: string;
  style?: CSSProperties;
}

const OVERLAY: CSSProperties = {
  position: "absolute",
  display: "block",
  pointerEvents: "none",
};

/**
 * A prismatic, faceted light around the rim of its parent.
 *
 * Drop it inside any positioned element; it fills the box and paints only the
 * border. It never intercepts pointer events and adds no layout.
 *
 * ```tsx
 * <div style={{ position: "relative", borderRadius: 20 }}>
 *   <Facet preset="diamond" />
 *   <YourContent />
 * </div>
 * ```
 */
export function Facet(props: FacetProps) {
  const {
    preset,
    colors,
    radius,
    thickness = 1.5,
    glow = 9,
    spill = 0.6,
    bleed,
    paused = false,
    reducedMotion = "still",
    className,
    style,
    ...rest
  } = props;

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const presetDef = preset && isPresetName(preset) ? presets[preset] : undefined;

  // Callers pass fresh array/object literals on every render, so both of these
  // are keyed on content rather than identity — otherwise the effect below
  // would tear down and rebuild the scene on every parent render.
  const paletteKey = (colors ?? presetDef?.colors ?? defaultPalette).join("|");
  const palette = useMemo(
    () => parsePalette(paletteKey.split("|")),
    [paletteKey],
  );

  const optionsKey = JSON.stringify(
    resolveOptions({ ...presetDef?.options, ...rest }),
  );
  const options = useMemo(
    () => JSON.parse(optionsKey) as FacetOptions,
    [optionsKey],
  );

  const renderStyle: RenderStyle = useMemo(
    () => ({ thickness, glow, spill }),
    [thickness, glow, spill],
  );

  // Sized from the renderer's own halo reach, so the glow is never cropped.
  const margin = Math.max(0, Math.round(bleed ?? haloExtent(renderStyle)));

  const prefersReduced = usePrefersReducedMotion();
  const still =
    paused || (prefersReduced && reducedMotion === "still") || options.speed === 0;
  const hidden = prefersReduced && reducedMotion === "hide";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || hidden) return;

    const parent = canvas.parentElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let scene: ReturnType<typeof buildScene> | null = null;
    let layer: CanvasRenderingContext2D | null = null;

    const resolveRadius = (): number => {
      if (radius !== undefined) return radius;
      if (!parent) return 0;
      const computed = getComputedStyle(parent).borderTopLeftRadius;
      const parsed = parseFloat(computed);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const buildScene = (w: number, h: number) => {
      const rim = createRim(w, h, resolveRadius());
      const facets = buildFacets(rim, options);
      return {
        rim,
        facets,
        paths: buildPaths(rim, facets),
        clip: buildClipPath(rim),
      };
    };

    const resize = () => {
      const box = parent ?? canvas;
      const rect = box.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w === width && h === height) return;
      width = w;
      height = h;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const full = { w: w + margin * 2, h: h + margin * 2 };
      canvas.width = Math.round(full.w * dpr);
      canvas.height = Math.round(full.h * dpr);
      canvas.style.width = `${full.w}px`;
      canvas.style.height = `${full.h}px`;
      // Shift the origin onto the box's top-left corner, so the renderer keeps
      // working in box-local coordinates and the bleed is invisible to it.
      ctx.setTransform(dpr, 0, 0, dpr, margin * dpr, margin * dpr);

      layer = createLayer(full.w, full.h, dpr, margin);
      scene = buildScene(w, h);
    };

    const draw = (time: number) => {
      if (!scene) return;
      renderFrame({
        ctx,
        layer,
        rim: scene.rim,
        facets: scene.facets,
        paths: scene.paths,
        clip: scene.clip,
        palette,
        options,
        style: renderStyle,
        time,
        width: width + margin * 2,
        height: height + margin * 2,
        bleed: margin,
      });
    };

    resize();

    // A frozen frame is taken a third of the way into the cycle: the rim is
    // lit and asymmetric there, rather than at the flat t=0 pose.
    if (still) {
      draw(cycleDuration(options) / 3);
    } else {
      const start = performance.now();
      const loop = (now: number) => {
        draw((now - start) / 1000);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            resize();
            if (still) draw(cycleDuration(options) / 3);
          })
        : null;
    if (observer && parent) observer.observe(parent);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      // Release the offscreen backing store rather than waiting for GC; a page
      // full of rims otherwise holds on to a lot of pixels.
      if (layer) {
        layer.canvas.width = 0;
        layer.canvas.height = 0;
      }
    };
  }, [palette, options, renderStyle, radius, margin, still, hidden]);

  if (hidden) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ ...OVERLAY, top: -margin, left: -margin, ...style }}
    />
  );
}

/** Starts false so server and first client render agree. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export interface FacetCardProps extends FacetProps {
  children?: ReactNode;
  /** Applied to the wrapper, which is `position: relative` by default. */
  containerStyle?: CSSProperties;
  containerClassName?: string;
}

/**
 * Convenience wrapper: a positioned box with the facet rim already inside it.
 * Use `Facet` directly when you own the container.
 */
export function FacetCard({
  children,
  containerStyle,
  containerClassName,
  radius = 20,
  ...facetProps
}: FacetCardProps) {
  return (
    <div
      className={containerClassName}
      style={{
        position: "relative",
        borderRadius: radius,
        ...containerStyle,
      }}
    >
      <Facet radius={radius} {...facetProps} />
      {children}
    </div>
  );
}
