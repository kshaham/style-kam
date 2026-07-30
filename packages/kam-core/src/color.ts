/**
 * Minimal colour handling. Deliberately dependency-free and small: the engine
 * only ever needs "parse a CSS hex/rgb string" and "which palette stops light
 * up at position u, and how much".
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX = /^#?([0-9a-f]{3,8})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i;

/** Parse `#abc`, `#aabbcc`, `#aabbccdd`, `rgb(...)` or `rgba(...)`. */
export function parseColor(input: string): Rgb {
  const value = input.trim();

  const fn = RGB_FN.exec(value);
  if (fn) {
    return {
      r: clamp255(parseFloat(fn[1])),
      g: clamp255(parseFloat(fn[2])),
      b: clamp255(parseFloat(fn[3])),
    };
  }

  const hex = HEX.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .slice(0, 3)
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (h.length >= 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
  }

  // Unknown format: fall back to white rather than throwing mid-animation.
  return { r: 255, g: 255, b: 255 };
}

function clamp255(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

export function parsePalette(colors: readonly string[]): Rgb[] {
  return colors.map(parseColor);
}

export function rgbaString(c: Rgb, alpha: number): string {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a.toFixed(4)})`;
}

/**
 * Distribute weight 1.0 across the palette stops for a wrapped position `u`.
 *
 * `u` is in turns, so u=0 and u=1 land on the same stop. Exactly two adjacent
 * stops are ever non-zero, which keeps the React Native renderer honest: it can
 * give each palette stop its own solid-colour layer and animate only opacity,
 * and still reproduce what the canvas renderer computes.
 */
export function paletteWeights(u: number, stops: number, out: number[]): void {
  for (let i = 0; i < stops; i++) out[i] = 0;
  if (stops === 0) return;
  if (stops === 1) {
    out[0] = 1;
    return;
  }

  let t = u % 1;
  if (t < 0) t += 1;
  const scaled = t * stops;
  const lo = Math.floor(scaled) % stops;
  const hi = (lo + 1) % stops;
  const f = scaled - Math.floor(scaled);
  out[lo] += 1 - f;
  out[hi] += f;
}

/** Mix palette stops by the weights produced above. */
export function mixPalette(palette: readonly Rgb[], weights: readonly number[]): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i < palette.length; i++) {
    const w = weights[i];
    if (!w) continue;
    r += palette[i].r * w;
    g += palette[i].g * w;
    b += palette[i].b * w;
    total += w;
  }
  if (total <= 0) return { r: 0, g: 0, b: 0 };
  return { r: r / total, g: g / total, b: b / total };
}
