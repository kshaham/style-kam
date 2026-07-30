import SwiftUI

@available(iOS 15.0, macOS 12.0, tvOS 15.0, watchOS 8.0, *)
private struct FacetRim: ViewModifier {
    let view: FacetView
    let radius: Double

    func body(content: Content) -> some View {
        content
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            // The overlay is grown past the content so the halo has somewhere to
            // go; `FacetView` insets by the same amount, so the rim still lands
            // exactly on the border.
            .overlay(view.padding(-view.margin).allowsHitTesting(false))
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
        paused: Bool = false
    ) -> some View {
        facetRim(
            colors: preset.colors,
            options: preset.options,
            radius: radius,
            thickness: thickness,
            glow: glow,
            spill: spill,
            paused: paused
        )
    }

    /// Same, but with an explicit palette and engine settings.
    public func facetRim(
        colors: [Color],
        options: FacetOptions = .default,
        radius: Double = 20,
        thickness: Double = 1.5,
        glow: Double = 9,
        spill: Double = 0.6,
        paused: Bool = false
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
                    paused: paused
                ),
                radius: radius
            )
        )
    }
}
