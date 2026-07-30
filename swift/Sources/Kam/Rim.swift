import CoreGraphics
import Foundation

/// Rounded-rectangle perimeter, parameterised by arc length.
///
/// Every renderer needs the same answer to one question: "given a distance `s`
/// travelled clockwise around the rim, where am I and which way is out?".
public struct Rim {
    public struct Point {
        /// Position in local coordinates, origin at the top-left of the box.
        public let point: CGPoint
        /// Outward unit normal.
        public let normal: CGVector
        /// Angle of the outward normal, radians, 0 = pointing right (+x).
        public let angle: Double
    }

    private enum Segment {
        case edge(from: CGPoint, delta: CGVector, length: Double, offset: Double, normal: Double)
        case arc(center: CGPoint, radius: Double, from: Double, to: Double, length: Double, offset: Double)

        var length: Double {
            switch self {
            case let .edge(_, _, length, _, _): return length
            case let .arc(_, _, _, _, length, _): return length
            }
        }

        var offset: Double {
            switch self {
            case let .edge(_, _, _, offset, _): return offset
            case let .arc(_, _, _, _, _, offset): return offset
            }
        }
    }

    public let size: CGSize
    public let radius: Double
    /// Total perimeter length.
    public let length: Double
    private let segments: [Segment]

    /// The walk starts at the top edge just past the top-left corner and
    /// proceeds clockwise (screen coordinates, +y down), so arc-length 0 sits at
    /// the top-left and increases to the right.
    public init(size: CGSize, radius: Double) {
        let w = Double(size.width)
        let h = Double(size.height)
        let r = max(0, min(radius, min(w, h) / 2))

        var segments: [Segment] = []
        var offset = 0.0

        func edge(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double, _ normal: Double) {
            let dx = x1 - x0
            let dy = y1 - y0
            let len = (dx * dx + dy * dy).squareRoot()
            guard len > 1e-6 else { return }
            segments.append(
                .edge(
                    from: CGPoint(x: x0, y: y0),
                    delta: CGVector(dx: dx, dy: dy),
                    length: len,
                    offset: offset,
                    normal: normal
                )
            )
            offset += len
        }

        func arc(_ cx: Double, _ cy: Double, _ a0: Double, _ a1: Double) {
            let len = abs(a1 - a0) * r
            guard len > 1e-6 else { return }
            segments.append(
                .arc(
                    center: CGPoint(x: cx, y: cy),
                    radius: r,
                    from: a0,
                    to: a1,
                    length: len,
                    offset: offset
                )
            )
            offset += len
        }

        edge(r, 0, w - r, 0, -.pi / 2)          // top, normal up
        arc(w - r, r, -.pi / 2, 0)              // top-right corner
        edge(w, r, w, h - r, 0)                 // right, normal +x
        arc(w - r, h - r, 0, .pi / 2)           // bottom-right corner
        edge(w - r, h, r, h, .pi / 2)           // bottom, normal +y
        arc(r, h - r, .pi / 2, .pi)             // bottom-left corner
        edge(0, h - r, 0, r, .pi)               // left, normal -x
        arc(r, r, .pi, .pi * 1.5)               // top-left corner

        self.size = size
        self.radius = r
        self.length = offset
        self.segments = segments
    }

    /// Sample the rim at arc length `s`. Values outside `0..<length` wrap.
    public func point(at s: Double) -> Point {
        guard length > 0, !segments.isEmpty else {
            return Point(point: .zero, normal: CGVector(dx: 0, dy: -1), angle: -.pi / 2)
        }

        var d = s.truncatingRemainder(dividingBy: length)
        if d < 0 { d += length }

        for segment in segments {
            let local = d - segment.offset
            guard local >= 0, local <= segment.length else { continue }
            let f = segment.length == 0 ? 0 : local / segment.length

            switch segment {
            case let .edge(from, delta, _, _, normal):
                return Point(
                    point: CGPoint(x: from.x + delta.dx * f, y: from.y + delta.dy * f),
                    normal: CGVector(dx: cos(normal), dy: sin(normal)),
                    angle: normal
                )
            case let .arc(center, radius, a0, a1, _, _):
                let a = a0 + (a1 - a0) * f
                let nx = cos(a)
                let ny = sin(a)
                return Point(
                    point: CGPoint(x: center.x + nx * radius, y: center.y + ny * radius),
                    normal: CGVector(dx: nx, dy: ny),
                    angle: a
                )
            }
        }

        // Floating-point drift past the last segment: clamp to the end.
        let last = segments[segments.count - 1]
        return point(at: last.offset + last.length - 1e-6)
    }

    /// The closed rounded rectangle itself, used to clip the inner spill so it
    /// washes over the surface without also fogging the space outside the box.
    public func outline() -> CGPath {
        let path = CGMutablePath()
        path.addPath(self.path(from: 0, to: length))
        path.closeSubpath()
        return path
    }

    /// Build the polyline covering one facet's span, for stroking.
    public func path(from start: Double, to end: Double) -> CGPath {
        let span = end - start
        // ~4pt between samples keeps corner arcs smooth without wasting segments.
        let steps = max(2, Int((span / 4).rounded(.up)))
        let path = CGMutablePath()

        for i in 0...steps {
            let p = point(at: start + span * Double(i) / Double(steps)).point
            if i == 0 {
                path.move(to: p)
            } else {
                path.addLine(to: p)
            }
        }

        return path
    }
}
