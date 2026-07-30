import SwiftUI

/// Tide — two waterlines closing on the middle of a view's rim.
///
/// Draws into a single `Canvas` driven by `TimelineView(.animation)`, with the
/// same additive pass structure the web renderer uses — spill, halo, bloom,
/// core — so a Tide on iOS and a Tide in a browser agree about how bright a
/// border is.
@available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
public struct TideView: View {
    /// Lifecycle. The clock restarts whenever this changes.
    public var state: TideState
    public var options: TideOptions
    /// Palette override; defaults to the palette for `state`.
    public var colors: [Color]?
    /// Corner radius of the rim. Match your container's corner radius.
    public var thickness: Double
    /// Bloom blur radius. 0 turns every blurred pass off.
    public var glow: Double
    /// How much colour washes the surface inside, 0...1.
    public var spill: Double
    public var cornerRadius: Double
    /// How far the canvas extends past the box so the halo is not cropped.
    public var bleed: Double?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The moment the current state began. `done` and `error` decay from t = 0,
    /// so this must reset on every state change or they are over before they
    /// are seen.
    @State private var epoch = Date()

    public init(
        state: TideState = .processing,
        options: TideOptions = .default,
        colors: [Color]? = nil,
        thickness: Double = 1.5,
        glow: Double = 9,
        spill: Double = 0.6,
        cornerRadius: Double = 20,
        bleed: Double? = nil
    ) {
        self.state = state
        self.options = options
        self.colors = colors
        self.thickness = thickness
        self.glow = glow
        self.spill = spill
        self.cornerRadius = cornerRadius
        self.bleed = bleed
    }

    private static let haloBlur = 1.8
    private static let haloWidth = 7.0

    /// Matches `haloExtent` in the web renderer, so both size their bleed alike.
    public var haloExtent: Double {
        let core = (thickness * Self.haloWidth) / 2
        return glow <= 0 ? core : glow * Self.haloBlur * 2.5 + core
    }

    var margin: Double { max(0, (bleed ?? haloExtent).rounded(.up)) }

    public var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { timeline in
            Canvas { context, size in
                // Frozen at the kiss under reduced motion — the most legible
                // single frame, and still unmistakably "busy".
                let t = reduceMotion
                    ? options.cycleDuration * 0.6
                    : timeline.date.timeIntervalSince(epoch)
                draw(context: context, size: size, time: max(0, t))
            }
        }
        .onChange(of: state) { _ in epoch = Date() }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func draw(context: GraphicsContext, size: CGSize, time: Double) {
        let inner = CGSize(width: size.width - margin * 2, height: size.height - margin * 2)
        guard inner.width > 1, inner.height > 1 else { return }

        let palette = colors ?? state.hexColors.map { Color(hex: $0) }
        guard !palette.isEmpty else { return }

        let rim = Rim(size: inner, radius: cornerRadius)
        let engine = TideEngine(options: options, height: Double(inner.height))

        // Evaluate every stretch once, then draw the passes from the cache.
        var lit: [(path: Path, color: Color, alpha: Double, white: Double, width: Double)] = []
        for stretch in rim.stretches() {
            let s = engine.sample(
                x: Double(stretch.position.x),
                y: Double(stretch.position.y),
                t: time,
                state: state
            )
            if s.alpha <= 0.002 && s.white <= 0.002 { continue }
            lit.append((
                Path(rim.path(from: stretch.s0, to: stretch.s1)),
                mix(palette, at: s.u),
                min(0.95, s.alpha),
                s.white,
                0.85 + 0.9 * s.crest
            ))
        }
        guard !lit.isEmpty else { return }

        var canvas = context
        canvas.translateBy(x: margin, y: margin)
        canvas.blendMode = .plusLighter

        // Each blurred pass is drawn into one layer and blurred on composite,
        // rather than blurring every stretch separately.
        func pass(widthMul: Double, alphaMul: Double, blur: Double, clipTo: Path? = nil) {
            canvas.drawLayer { layer in
                if let clipTo { layer.clip(to: clipTo) }
                layer.addFilter(.blur(radius: blur))
                for item in lit {
                    layer.stroke(
                        item.path,
                        with: .color(item.color.opacity(item.alpha * alphaMul)),
                        style: StrokeStyle(
                            lineWidth: max(0.4, item.width * thickness * widthMul),
                            lineCap: .round, lineJoin: .round
                        )
                    )
                }
            }
        }

        if glow > 0 {
            if spill > 0 {
                pass(widthMul: 14, alphaMul: 0.2 * spill, blur: glow * 2.2, clipTo: Path(rim.outline()))
            }
            pass(widthMul: Self.haloWidth, alphaMul: 0.22, blur: glow * Self.haloBlur)
            pass(widthMul: 2.8, alphaMul: 0.6, blur: glow)
        }

        // The crisp core, unblurred — this is the pass a global filter destroys.
        for item in lit {
            canvas.stroke(
                item.path,
                with: .color(item.color.opacity(item.alpha)),
                style: StrokeStyle(
                    lineWidth: max(0.4, item.width * thickness),
                    lineCap: .round, lineJoin: .round
                )
            )
        }

        for item in lit where item.white > 0.004 {
            canvas.stroke(
                item.path,
                with: .color(.white.opacity(min(1, item.white))),
                style: StrokeStyle(lineWidth: max(0.5, thickness * 0.5), lineCap: .round)
            )
        }
    }

    /// Sample the palette at `u` turns. Only two adjacent stops are ever mixed,
    /// which is what lets the React Native renderer reproduce this with solid
    /// colour layers and opacity alone.
    private func mix(_ palette: [Color], at u: Double) -> Color {
        let stops = palette.count
        if stops == 1 { return palette[0] }
        var turn = u.truncatingRemainder(dividingBy: 1)
        if turn < 0 { turn += 1 }
        let scaled = turn * Double(stops)
        let lo = Int(scaled.rounded(.down)) % stops
        let hi = (lo + 1) % stops
        let f = scaled - scaled.rounded(.down)
        let a = palette[lo].rgbComponents
        let b = palette[hi].rgbComponents
        return Color(
            red: a.0 + (b.0 - a.0) * f,
            green: a.1 + (b.1 - a.1) * f,
            blue: a.2 + (b.2 - a.2) * f
        )
    }
}

@available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
private struct TideRim: ViewModifier {
    let view: TideView
    let radius: Double

    func body(content: Content) -> some View {
        content
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            // Grown past the content so the halo has room; `TideView` insets by
            // the same amount, so the rim still lands exactly on the border.
            .overlay(view.padding(-view.margin).allowsHitTesting(false))
    }
}

@available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
extension View {
    /// Attach a Tide indicator to this view's rim.
    ///
    /// ```swift
    /// CardContent()
    ///     .padding(20)
    ///     .background(.black)
    ///     .tide(saving ? .processing : .idle, radius: 20)
    /// ```
    ///
    /// The halo extends beyond the view's bounds, so avoid clipping an ancestor
    /// unless you mean to crop it. The state shown here is decorative — announce
    /// it in text alongside, since this view is hidden from assistive tech.
    public func tide(
        _ state: TideState,
        options: TideOptions = .default,
        colors: [Color]? = nil,
        radius: Double = 20,
        thickness: Double = 1.5,
        glow: Double = 9,
        spill: Double = 0.6
    ) -> some View {
        modifier(
            TideRim(
                view: TideView(
                    state: state,
                    options: options,
                    colors: colors,
                    thickness: thickness,
                    glow: glow,
                    spill: spill,
                    cornerRadius: radius
                ),
                radius: radius
            )
        )
    }
}
