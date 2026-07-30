import SwiftUI

/// Named looks. Each is a palette plus the engine settings that make that
/// palette read the way it is supposed to — a hard, icy stone needs a different
/// specular exponent from a soft, smouldering one.
///
/// These mirror the presets in `kam-core` exactly.
public enum FacetPreset: String, CaseIterable, Sendable {
    /// The default. Cool violet through cyan, with a warm pink flare.
    case prism
    /// Hard, high-contrast white-blue. Few facets lit at once.
    case diamond
    /// Slow, molten, low glint. Reads as heat rather than sparkle.
    case ember
    /// Wide, drifting green-teal curtain. Barely faceted.
    case aurora
    /// Monochrome, restrained. For interfaces that cannot afford colour.
    case graphite

    public var hexColors: [String] {
        switch self {
        case .prism: return ["#8b5cf6", "#22d3ee", "#f472b6"]
        case .diamond: return ["#e0f2fe", "#7dd3fc", "#c4b5fd", "#ffffff"]
        case .ember: return ["#f97316", "#facc15", "#dc2626"]
        case .aurora: return ["#34d399", "#22d3ee", "#a78bfa", "#4ade80"]
        case .graphite: return ["#f8fafc", "#94a3b8", "#cbd5e1"]
        }
    }

    public var colors: [Color] {
        hexColors.map { Color(hex: $0) }
    }

    public var options: FacetOptions {
        var o = FacetOptions.default
        switch self {
        case .prism:
            break
        case .diamond:
            o.sharpness = 18
            o.scatter = 0.62
            o.glint = 0.9
            o.bloom = 0.14
            o.ambient = 0.16
            o.dispersion = 0.28
            o.breath = 0.18
        case .ember:
            o.sharpness = 6
            o.scatter = 0.34
            o.bloom = 0.34
            o.ambient = 0.3
            o.glint = 0.22
            o.speed = 0.05
            o.breath = 0.42
            o.dispersion = 0.22
        case .aurora:
            o.sharpness = 3.5
            o.scatter = 0.2
            o.bloom = 0.55
            o.ambient = 0.34
            o.glint = 0.14
            o.speed = 0.045
            o.swirl = 0.9
            o.breath = 0.36
            o.dispersion = 0.5
        case .graphite:
            o.sharpness = 14
            o.scatter = 0.55
            o.glint = 0.4
            o.bloom = 0.16
            o.ambient = 0.2
            o.breath = 0.2
            o.dispersion = 0.16
        }
        return o
    }
}
