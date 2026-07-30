/**
 * Rounded-rectangle perimeter, parameterised by arc length.
 *
 * Every renderer (canvas, React Native views, SwiftUI Canvas) needs the same
 * answer to one question: "given a distance `s` travelled clockwise around the
 * rim, where am I and which way is out?". This module is that answer.
 */

const TAU = Math.PI * 2;

export interface RimPoint {
  /** Position in local coordinates, origin at the top-left of the box. */
  x: number;
  y: number;
  /** Outward unit normal. */
  nx: number;
  ny: number;
  /** Angle of the outward normal, radians, 0 = pointing right (+x). */
  angle: number;
}

type SegmentKind = "edge" | "arc";

interface Segment {
  kind: SegmentKind;
  length: number;
  /** Cumulative arc length at the segment start. */
  offset: number;
  /** Edge: start point + direction. Arc: centre + angle sweep. */
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** Edge only: constant outward normal angle. */
  normal: number;
  /** Arc only. */
  cx: number;
  cy: number;
  r: number;
  a0: number;
  a1: number;
}

export interface Rim {
  width: number;
  height: number;
  radius: number;
  /** Total perimeter length. */
  length: number;
  segments: Segment[];
}

function edge(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  normal: number,
  offset: number,
): Segment {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  return {
    kind: "edge",
    length,
    offset,
    x0,
    y0,
    dx,
    dy,
    normal,
    cx: 0,
    cy: 0,
    r: 0,
    a0: 0,
    a1: 0,
  };
}

function arc(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  offset: number,
): Segment {
  return {
    kind: "arc",
    length: Math.abs(a1 - a0) * r,
    offset,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    normal: 0,
    cx,
    cy,
    r,
    a0,
    a1,
  };
}

/**
 * Build the rim description. The walk starts at the top edge just past the
 * top-left corner and proceeds clockwise (in screen coordinates, where +y is
 * down), so arc-length 0 sits at the top-left and increases to the right.
 */
export function createRim(width: number, height: number, radius: number): Rim {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  const segments: Segment[] = [];
  let offset = 0;

  const push = (seg: Segment) => {
    if (seg.length > 1e-6) {
      segments.push(seg);
      offset += seg.length;
    }
  };

  // Top edge, outward normal points up (-y) which is angle -PI/2.
  push(edge(r, 0, width - r, 0, -Math.PI / 2, offset));
  // Top-right corner.
  push(arc(width - r, r, r, -Math.PI / 2, 0, offset));
  // Right edge, normal +x.
  push(edge(width, r, width, height - r, 0, offset));
  // Bottom-right corner.
  push(arc(width - r, height - r, r, 0, Math.PI / 2, offset));
  // Bottom edge, normal +y.
  push(edge(width - r, height, r, height, Math.PI / 2, offset));
  // Bottom-left corner.
  push(arc(r, height - r, r, Math.PI / 2, Math.PI, offset));
  // Left edge, normal -x.
  push(edge(0, height - r, 0, r, Math.PI, offset));
  // Top-left corner.
  push(arc(r, r, r, Math.PI, Math.PI * 1.5, offset));

  return { width, height, radius: r, length: offset, segments };
}

/** Sample the rim at arc length `s`. Values outside [0, length) wrap. */
export function rimPointAt(rim: Rim, s: number): RimPoint {
  if (rim.length <= 0) {
    return { x: 0, y: 0, nx: 0, ny: -1, angle: -Math.PI / 2 };
  }
  let d = s % rim.length;
  if (d < 0) d += rim.length;

  // Linear scan: at most 8 segments, cheaper than a binary search here.
  for (let i = 0; i < rim.segments.length; i++) {
    const seg = rim.segments[i];
    const local = d - seg.offset;
    if (local < 0 || local > seg.length) continue;
    if (seg.kind === "edge") {
      const f = seg.length === 0 ? 0 : local / seg.length;
      return {
        x: seg.x0 + seg.dx * f,
        y: seg.y0 + seg.dy * f,
        nx: Math.cos(seg.normal),
        ny: Math.sin(seg.normal),
        angle: seg.normal,
      };
    }
    const f = seg.length === 0 ? 0 : local / seg.length;
    const a = seg.a0 + (seg.a1 - seg.a0) * f;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    return {
      x: seg.cx + nx * seg.r,
      y: seg.cy + ny * seg.r,
      nx,
      ny,
      angle: a,
    };
  }

  // Floating point drift past the last segment: clamp to the end.
  const last = rim.segments[rim.segments.length - 1];
  return rimPointAt(rim, last.offset + last.length - 1e-6);
}

/**
 * Shortest signed difference between two angles, in (-PI, PI].
 * Used to compare a facet normal against the light direction.
 */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
