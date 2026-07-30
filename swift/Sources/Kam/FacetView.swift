import SwiftUI

/// A prismatic, faceted light around the rim of a rounded rectangle.
///
/// Draws into a single `Canvas` driven by `TimelineView(.animation)`, so the
/// whole effect is one view and one draw pass — no layers, no shape stacks, no
/// per-facet SwiftUI views to diff.
///
/// ```swift
/// ZStack {
///     content
/// }
/// .facetRim(preset: .diamond, radius: 20)
/// ```
@available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
public struct FacetView: View {
    /// Palette, in the order the light travels through it.
    public var colors: [Color]
    public var options: FacetOptions
    /// Corner radius of the rim. Match your container's corner radius.
    public var radius: Double
    /// Core line width.
    public var thickness: Double
    /// Bloom blur radius. 0 turns the halo off.
    public var glow: Double
    /// Strength of the soft wash of colour across the surface inside, 0...1.
    public var spill: Double
    /// How far the canvas extends beyond the box so the outer halo has
    /// somewhere to go. Defaults to the renderer's own halo reach.
    public var bleed: Double?
    /// Freeze the animation on a still frame.
    public var paused: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
        colors: [Color] = FacetPreset.prism.colors,
        options: FacetOptions = .default,
        radius: Double = 20,
        thickness: Double = 1.5,
        glow: Double = 9,
        spill: Double = 0.6,
        bleed: Double? = nil,
        paused: Bool = false
    ) {
        self.colors = colors
        self.options = options
        self.radius = radius
        self.thickness = thickness
        self.glow = glow
        self.spill = spill
        self.bleed = bleed
        self.paused = paused
    }

    /// Blur radius and line width of the outermost pass, relative to the style.
    private static let haloBlur = 1.8
    private static let haloWidth = 7.0

    /// How far the widest pass reaches beyond the rim.
    ///
    /// The canvas has to be at least this much larger than the box or the halo
    /// is cut off against its edge — a hard straight line across an otherwise
    /// soft glow. A Gaussian is truncated at 2.5 sigma, past which it
    /// contributes under a percent of a pass already at a fifth opacity.
    public var haloExtent: Double {
        let core = (thickness * Self.haloWidth) / 2
        return glow <= 0 ? core : glow * Self.haloBlur * 2.5 + core
    }

    var margin: Double { max(0, (bleed ?? haloExtent).rounded(.up)) }

    private var isStill: Bool {
        paused || reduceMotion || options.speed == 0
    }

    public var body: some View {
        TimelineView(.animation(paused: isStill)) { timeline in
            Canvas { context, size in
                // A frozen frame is taken a third of the way into the cycle: the
                // rim is lit and asymmetric there, unlike the flat t=0 pose.
                let time = isStill
                    ? options.cycleDuration / 3
                    : timeline.date.timeIntervalSinceReferenceDate
                draw(context: context, size: size, time: time)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func draw(context: GraphicsContext, size: CGSize, time: Double) {
        // The canvas is inflated by `margin` on every side; the box itself is
        // the rectangle inset from it. Shifting the origin lets everything
        // below work in box-local coordinates.
        let inner = CGSize(
            width: size.width - margin * 2,
            height: size.height - margin * 2
        )
        guard inner.width > 1, inner.height > 1, !colors.isEmpty else { return }

        let rim = Rim(size: inner, radius: radius)
        let facets = FacetEngine.buildFacets(rim: rim, options: options)
        let stops = colors.count

        var weights = [Double](repeating: 0, count: stops)
        var scratch = [Double](repeating: 0, count: stops)

        // Evaluate every facet once, then draw the passes from the cached values.
        var lit: [(path: Path, color: Color, alpha: Double, glint: Double)] = []
        lit.reserveCapacity(facets.count)

        for facet in facets {
            let result = FacetEngine.sample(
                facet: facet,
                time: time,
                options: options,
                stops: stops,
                weights: &weights,
                scratch: &scratch
            )
            if result.total <= 0.002 && result.glint <= 0.002 { continue }

            // Bars overlap slightly so the rim reads as continuous.
            let path = Path(rim.path(from: facet.start, to: facet.end))
            lit.append((path, mix(colors, weights), min(1, result.total), result.glint))
        }

        guard !lit.isEmpty else { return }

        // Additive blending so overlapping facets accumulate like light rather
        // than painting over one another.
        var canvas = context
        canvas.translateBy(x: margin, y: margin)
        canvas.blendMode = .plusLighter

        // Each blurred pass is drawn into one layer and blurred on composite,
        // rather than blurring every facet separately.
        func blurredPass(lineWidth: Double, alphaScale: Double, blur: Double, clipTo: Path? = nil) {
            canvas.drawLayer { layer in
                if let clipTo { layer.clip(to: clipTo) }
                layer.addFilter(.blur(radius: blur))
                for item in lit {
                    layer.stroke(
                        item.path,
                        with: .color(item.color.opacity(item.alpha * alphaScale)),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round)
                    )
                }
            }
        }

        if glow > 0 {
            // Inner spill: a wide, soft wash of the rim's colour across the
            // surface. Clipped to the outline so it lights the card rather than
            // fogging the space around it.
            if spill > 0 {
                blurredPass(
                    lineWidth: thickness * 14,
                    alphaScale: 0.22 * spill,
                    blur: glow * 2.2,
                    clipTo: Path(rim.outline())
                )
            }
            // The atmosphere outside the box, which `bleed` makes room for.
            blurredPass(
                lineWidth: thickness * Self.haloWidth,
                alphaScale: 0.22,
                blur: glow * Self.haloBlur
            )
            blurredPass(lineWidth: thickness * 2.8, alphaScale: 0.6, blur: glow)
        }

        for item in lit {
            canvas.stroke(
                item.path,
                with: .color(item.color.opacity(item.alpha)),
                style: StrokeStyle(lineWidth: thickness, lineCap: .round, lineJoin: .round)
            )
        }

        // Glint: a short, very bright white core on the facets cut steepest.
        let glintWidth = max(0.6, thickness * 0.55)
        for item in lit where item.glint > 0.004 {
            canvas.stroke(
                item.path,
                with: .color(.white.opacity(min(1, item.glint))),
                style: StrokeStyle(lineWidth: glintWidth, lineCap: .round, lineJoin: .round)
            )
        }
    }

    /// Mix palette stops by the weights the engine produced.
    private func mix(_ palette: [Color], _ weights: [Double]) -> Color {
        var r = 0.0, g = 0.0, b = 0.0, total = 0.0
        for (index, weight) in weights.enumerated() where weight > 0 {
            let components = palette[index].rgbComponents
            r += components.0 * weight
            g += components.1 * weight
            b += components.2 * weight
            total += weight
        }
        guard total > 0 else { return .clear }
        return Color(red: r / total, green: g / total, blue: b / total)
    }
}
