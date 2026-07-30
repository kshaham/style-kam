/**
 * <Tide> — the border indicator as a React component.
 *
 * Mirrors <Facet>: absolutely fills its positioned parent, reads that parent's
 * border-radius, paints only light, and never intercepts pointer events. The
 * canvas is drawn larger than the box by `haloExtent` so the outer glow is not
 * clipped to a hard edge.
 */

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type TideOptions,
  type TidePresetName,
  type TideState,
  buildStretches,
  createRim,
  isTidePreset,
  parsePalette,
  resolveGeometry,
  resolveTideOptions,
  rimPointAt,
  tideCycleDuration,
  tidePalettes,
  tidePresets,
} from "kam-core";
import { type RenderStyle, haloExtent, renderFrame } from "./tideRenderer.js";

export interface TideProps extends Partial<TideOptions> {
  /** Lifecycle. The clock restarts whenever this changes. */
  state?: TideState;
  /** Named tuning. Individual options passed alongside it win. */
  preset?: TidePresetName;
  /** Palette override; defaults to the palette for `state`. */
  colors?: readonly string[];
  /** Core line width, in CSS pixels. */
  thickness?: number;
  /** Bloom blur radius. 0 disables every blurred pass. */
  glow?: number;
  /** How much colour washes the surface inside the box, 0..1. */
  spill?: number;
  /** Corner radius override, if the parent's own radius is wrong for this. */
  radius?: number;
  /** `still` freezes at the kiss; `hide` removes the effect entirely. */
  reducedMotion?: "still" | "hide";
  className?: string;
  style?: CSSProperties;
}

const OVERLAY: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "block",
  pointerEvents: "none",
};

export function Tide(props: TideProps) {
  const {
    state = "processing",
    preset,
    colors,
    thickness = 1.5,
    glow = 9,
    spill = 0.6,
    radius,
    reducedMotion = "still",
    className,
    style: styleProp,
    ...rest
  } = props;

  const host = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const presetOptions = preset && isTidePreset(preset) ? tidePresets[preset] : undefined;

  // Callers pass fresh literals every render, so both of these are keyed on
  // content rather than identity — otherwise the draw effect would tear down
  // and rebuild the scene on every parent render.
  const optionsKey = JSON.stringify(resolveTideOptions({ ...presetOptions, ...rest }));
  const options = useMemo(() => JSON.parse(optionsKey) as TideOptions, [optionsKey]);

  const paletteKey = [...(colors ?? tidePalettes[state])].join("|");
  const palette = useMemo(() => parsePalette(paletteKey.split("|")), [paletteKey]);

  const renderStyle = useMemo<RenderStyle>(
    () => ({ thickness, glow, spill }),
    [thickness, glow, spill],
  );
  const bleed = Math.max(0, Math.round(haloExtent(renderStyle)));

  useLayoutEffect(() => {
    const parent = host.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() => {
      const rect = parent.getBoundingClientRect();
      setBox((prev) => {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        return prev.width === w && prev.height === h ? prev : { width: w, height: h };
      });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    const parent = host.current?.parentElement;
    if (!el || !parent || box.width < 1 || box.height < 1) return;

    const ctx = el.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced && reducedMotion === "hide") {
      ctx.clearRect(-bleed, -bleed, el.width, el.height);
      return;
    }

    const dpr = Math.min(devicePixelRatio || 1, 2.5);
    const full = { w: box.width + bleed * 2, h: box.height + bleed * 2 };
    el.width = Math.round(full.w * dpr);
    el.height = Math.round(full.h * dpr);
    el.style.width = `${full.w}px`;
    el.style.height = `${full.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, bleed * dpr, bleed * dpr);

    // One offscreen layer for the blurred passes, blurred once on composite.
    const off = document.createElement("canvas");
    off.width = el.width;
    off.height = el.height;
    const layer = off.getContext("2d");
    if (layer) layer.setTransform(dpr, 0, 0, dpr, bleed * dpr, bleed * dpr);

    // Explicit grouping: an override wins outright, otherwise take the parent's
    // computed radius and fall back to 0 when it does not parse.
    const corner =
      radius ?? (parseFloat(getComputedStyle(parent).borderTopLeftRadius) || 0);
    const rim = createRim(box.width, box.height, corner);
    const stretches = buildStretches(rim);
    const geo = resolveGeometry(box.height, options);

    const clip = new Path2D();
    const steps = Math.max(24, Math.ceil(rim.length / 4));
    for (let i = 0; i <= steps; i++) {
      const p = rimPointAt(rim, (rim.length * i) / steps);
      if (i === 0) clip.moveTo(p.x, p.y);
      else clip.lineTo(p.x, p.y);
    }
    clip.closePath();

    const draw = (time: number) =>
      renderFrame({
        ctx,
        layer,
        rim,
        stretches,
        clip,
        palette,
        options,
        geo,
        style: renderStyle,
        state,
        time,
        width: full.w,
        height: full.h,
        bleed,
      });

    let frame = 0;
    if (reduced) {
      // The kiss is the most legible single frame, so that is where we freeze.
      draw(tideCycleDuration(options) * 0.6);
    } else {
      const start = performance.now();
      const loop = (now: number) => {
        draw((now - start) / 1000);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      // Release the offscreen backing store rather than waiting for GC.
      off.width = 0;
      off.height = 0;
    };
    // `state` restarts the clock, which the one-shot transitions rely on.
  }, [
    box.width,
    box.height,
    state,
    options,
    palette,
    renderStyle,
    bleed,
    radius,
    reducedMotion,
  ]);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className={className}
      style={{ ...OVERLAY, ...styleProp }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: -bleed,
          left: -bleed,
          display: "block",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export interface TideCardProps extends TideProps {
  children?: ReactNode;
  containerStyle?: CSSProperties;
  containerClassName?: string;
}

/**
 * Convenience wrapper: a positioned box with the indicator already inside it.
 * Use `Tide` directly when you own the container.
 */
export function TideCard({
  children,
  containerStyle,
  containerClassName,
  radius = 20,
  ...tideProps
}: TideCardProps) {
  return (
    <div
      className={containerClassName}
      style={{ position: "relative", borderRadius: radius, ...containerStyle }}
    >
      <Tide radius={radius} {...tideProps} />
      {children}
    </div>
  );
}
