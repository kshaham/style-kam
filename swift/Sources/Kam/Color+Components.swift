import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

extension Color {
    /// sRGB components in 0...1, alpha included.
    ///
    /// `Color.resolve(in:)` would be tidier but is iOS 17+, and the rest of this
    /// package works from iOS 15, so this goes through the platform colour type
    /// and falls back to the raw `cgColor` where one is available.
    ///
    /// Alpha is carried rather than discarded: a palette stop authored at less
    /// than full opacity is a deliberate instruction to draw that stretch of rim
    /// fainter, and dropping it silently promotes the stop to full strength.
    var rgbaComponents: (Double, Double, Double, Double) {
        #if canImport(UIKit)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        if UIColor(self).getRed(&r, green: &g, blue: &b, alpha: &a) {
            return (Double(r), Double(g), Double(b), Double(a))
        }
        #elseif canImport(AppKit)
        if let converted = NSColor(self).usingColorSpace(.sRGB) {
            return (
                Double(converted.redComponent),
                Double(converted.greenComponent),
                Double(converted.blueComponent),
                Double(converted.alphaComponent)
            )
        }
        #endif

        if let components = cgColor?.components, components.count >= 3 {
            return (
                Double(components[0]),
                Double(components[1]),
                Double(components[2]),
                components.count >= 4 ? Double(components[3]) : 1
            )
        }

        return (1, 1, 1, 1)
    }

    /// Build a `Color` from a CSS-style hex string, so a palette can be shared
    /// verbatim with the web and React Native packages.
    ///
    /// Deliberately **internal**. It is non-failable and answers malformed input
    /// with white, which is the right trade for this package's own preset tables
    /// but the wrong one for an app: exported, it silently overloads a host app's
    /// failable `Color.init?(hex:)` and turns "drop this bad value" into "paint it
    /// white". Consumers should keep their own hex parser.
    init(hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }

        if value.count == 3 || value.count == 4 {
            value = String(value.prefix(3)).map { "\($0)\($0)" }.joined()
        }

        guard value.count >= 6, let raw = UInt32(String(value.prefix(6)), radix: 16) else {
            self = .white
            return
        }

        self.init(
            .sRGB,
            red: Double((raw >> 16) & 0xFF) / 255,
            green: Double((raw >> 8) & 0xFF) / 255,
            blue: Double(raw & 0xFF) / 255,
            opacity: 1
        )
    }
}
