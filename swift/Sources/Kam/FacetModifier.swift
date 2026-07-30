import SwiftUI

@available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
private struct FacetRim: ViewModifier {
    let view: FacetView
    let radius: Double
    let clip: Bool

    func body(content: Content) -> some View {
        clipped(content)
            // The overlay is grown past the content so the halo has somewhere to
            // go; `FacetView` insets by the same amount, so the rim still lands
            // exactly on the border.
            .overlay(view.padding(-view.margin).allowsHitTesting(false))
    }

    /// The convenience clip, and the two reasons to decline it.
    ///
    /// It exists so the common case — a plain rounded box — cannot end up with
    /// content spilling past the rim that is supposed to contain it. But it is a
    /// `.continuous` squircle while ``Rim`` traces circular arcs, and the two
    /// diverge most at a capsule, where the whole end cap is corner. It also
    /// crops anything the host draws outside its own bounds, which is most drop
    /// shadows. Hosts that already own their silhouette should pass
    /// `clip: false` and keep it.
    @ViewBuilder
    private func clipped(_ content: Content) -> some View {
        if clip && radius.isFinite {
            content.clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        } else if clip {
            content.clipShape(Capsule(style: .circular))
        } else {
            content
        }
    }
}

@available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
extension View {
    /// Wrap this view in a rounded rectangle and lay a faceted rim over it.
    ///
    /// ```swift
    /// CardContent()
    ///     .padding(24)
    ///     .background(.black)
    ///     .facetRim(preset: .diamond, radius: 20)
    /// ```
    ///
    /// The halo extends beyond the view's bounds, so avoid clipping an ancestor
    /// unless you mean to crop it.
    public func facetRim(
        preset: FacetPreset = .prism,
        radius: Double = 20,
        thickness: Double = 1.5,
        glow: Double = 9,
        spill: Double = 0.6,
        paused: Bool = false,
        blendMode: GraphicsContext.BlendMode = .plusLighter,
        clip: Bool = true
    ) -> some View {
        facetRim(
            colors: preset.colors,
            options: preset.options,
            radius: radius,
            thickness: thickness,
            glow: glow,
            spill: spill,
            paused: paused,
            blendMode: blendMode,
            clip: clip
        )
    }

    /// Same, but with an explicit palette and engine settings.
    ///
    /// - Parameters:
    ///   - radius: Corner radius of the rim. ``Rim`` clamps this to half the
    ///     shorter side, so `.infinity` is a capsule and — on a square — a
    ///     circle.
    ///   - blendMode: `.plusLighter` accumulates the passes like light and wants
    ///     a dark surface; pass `.normal` on a light one or the rim bleaches
    ///     toward white. See ``FacetView/blendMode``.
    ///   - clip: Whether to clip the content to the rim's shape. Pass `false`
    ///     for a host that already owns its silhouette or draws outside its
    ///     bounds — a card with a drop shadow, say.
    public func facetRim(
        colors: [Color],
        options: FacetOptions = .default,
        radius: Double = 20,
        thickness: Double = 1.5,
        glow: Double = 9,
        spill: Double = 0.6,
        paused: Bool = false,
        blendMode: GraphicsContext.BlendMode = .plusLighter,
        clip: Bool = true
    ) -> some View {
        modifier(
            FacetRim(
                view: FacetView(
                    colors: colors,
                    options: options,
                    radius: radius,
                    thickness: thickness,
                    glow: glow,
                    spill: spill,
                    paused: paused,
                    blendMode: blendMode
                ),
                radius: radius,
                clip: clip
            )
        )
    }
}
