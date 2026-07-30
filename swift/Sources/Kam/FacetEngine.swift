import CoreGraphics
import Foundation

/// The Facet engine.
///
/// The rim of a shape is treated as the girdle of a cut gem: it is divided into
/// discrete facets, each given a deterministic micro-tilt, and lit by a single
/// light whose azimuth rotates slowly. A facet flares when its tilted normal
/// lines up with the light, so light does not sweep smoothly around the border —
/// it scatters, catching some facets early and others late, the way a real cut
/// stone does.
///
/// Three chromatic samples are taken at slightly different light azimuths,
/// which pulls neighbouring palette colours apart into a prism fringe on either
/// side of each flare.
///
/// This is a direct port of `kam-core`. Same maths, same seeds, same output —
/// a design tuned on the web looks identical here.
public struct FacetOptions: Equatable, Sendable {
    /// Number of facets around the rim.
    public var facets: Int
    /// Light revolutions per second. Low is good; this is a slow shimmer.
    public var speed: Double
    /// Specular exponent. Higher = tighter, harder glints.
    public var sharpness: Double
    /// Weight of the broad, soft falloff that underlies the glints.
    public var bloom: Double
    /// Constant floor of light on every facet, regardless of where the light is
    /// pointing.
    ///
    /// A facet only catches the light across half a turn, so without this the
    /// far side of the rim emits nothing and the border stops existing there.
    /// Ambient keeps the whole edge drawn — tinted, and drifting in hue with
    /// the light — so the flares read as highlights on a border rather than as
    /// the border. Set to 0 for a stark single-arc look.
    public var ambient: Double
    /// Angular separation between chromatic samples, in radians.
    public var dispersion: Double
    /// Number of chromatic samples. 1 disables dispersion.
    public var samples: Int
    /// Maximum facet micro-tilt in radians. 0 = a smooth, un-faceted rim.
    public var scatter: Double
    /// How evenly facet orientations are spread around the rim, 0...1.
    ///
    /// A rounded rectangle keeps almost all of its normal-angle variation in
    /// the four corner arcs — every facet along a straight edge shares one
    /// normal. At `spread: 0` the light is tested against those true normals,
    /// so a whole edge flares at once and the diagonals between edges go dark;
    /// how bad that looks depends entirely on the box's aspect ratio. At
    /// `spread: 1` orientations are distributed evenly by rim position instead,
    /// so how evenly the rim lights up no longer depends on the shape at all —
    /// a wide banner and a tall tile shimmer alike. The residual flicker that
    /// remains at `spread: 1` comes from `scatter`, and is the point of the
    /// effect rather than an artefact.
    public var spread: Double
    /// How much a facet's rim position shifts its palette lookup, in turns.
    public var swirl: Double
    /// Strength of the white specular spike on sharply tilted facets.
    public var glint: Double
    /// Depth of the slow whole-rim pulse, 0...1.
    public var breath: Double
    /// Pulses per light revolution. Integer keeps the whole effect periodic.
    public var breathCycles: Double
    /// Overall output multiplier.
    public var intensity: Double
    /// Seed for the facet tilt/sparkle distribution.
    public var seed: Int

    public init(
        facets: Int = 34,
        speed: Double = 0.075,
        sharpness: Double = 11,
        bloom: Double = 0.22,
        ambient: Double = 0.24,
        dispersion: Double = 0.34,
        samples: Int = 3,
        scatter: Double = 0.5,
        spread: Double = 0.85,
        swirl: Double = 0.45,
        glint: Double = 0.55,
        breath: Double = 0.28,
        breathCycles: Double = 2,
        intensity: Double = 1,
        seed: Int = 7
    ) {
        self.facets = facets
        self.speed = speed
        self.sharpness = sharpness
        self.bloom = bloom
        self.ambient = ambient
        self.dispersion = dispersion
        self.samples = samples
        self.scatter = scatter
        self.spread = spread
        self.swirl = swirl
        self.glint = glint
        self.breath = breath
        self.breathCycles = breathCycles
        self.intensity = intensity
        self.seed = seed
    }

    public static let `default` = FacetOptions()

    /// Duration of one full loop of the animation, in seconds.
    public var cycleDuration: Double {
        abs(speed) > 1e-6 ? 1 / abs(speed) : 0
    }
}

public struct FacetPatch: Sendable {
    public let index: Int
    /// Arc-length span on the rim.
    public let start: Double
    public let end: Double
    /// Midpoint of the span.
    public let position: CGPoint
    /// Outward normal angle at the midpoint, before tilt.
    public let normal: Double
    /// Tilted normal angle — what the light actually tests against.
    public let angle: Double
    /// Tangent angle, for renderers that place a rotated rectangle.
    public let tangent: Double
    /// Normalised position around the rim, 0...1.
    public let u: Double
    /// Per-facet sparkle weight, 0...1. Drives the white glint.
    public let sparkle: Double
}

public struct FacetSample: Sendable {
    /// Per-palette-stop weight. Sums to `total`.
    public var weights: [Double]
    /// White specular spike, already scaled by `glint`.
    public var glint: Double
    /// Total brightness across all stops, before the glint is added.
    public var total: Double
}

private let tau = Double.pi * 2

/// Deterministic hash -> [0, 1). Mirrors the TypeScript implementation bit for
/// bit, so a seed picked on the web reproduces exactly here.
private func hash(_ n: Int, _ seed: Int) -> Double {
    var x = UInt32(truncatingIfNeeded: n &* 374_761_393 &+ seed &* 668_265_263)
    x ^= x >> 13
    x = x &* 1_274_126_177
    x ^= x >> 16
    return Double(x) / 4_294_967_296
}

public enum FacetEngine {
    /// Cut the rim into facets. Pure geometry, recomputed only on resize.
    public static func buildFacets(rim: Rim, options: FacetOptions) -> [FacetPatch] {
        let count = max(3, options.facets)
        let step = rim.length / Double(count)
        var out: [FacetPatch] = []
        out.reserveCapacity(count)

        for i in 0..<count {
            let start = Double(i) * step
            let mid = rim.point(at: start + step / 2)
            let tilt = (hash(i, options.seed) * 2 - 1) * options.scatter
            let sparkleRaw = hash(i + 9973, options.seed)
            let u = Double(i) / Double(count)

            // `Rim.point(at:)` sweeps its normal angle monotonically from -pi/2
            // to 3pi/2 over one full walk, and so does the even distribution
            // below, so the two can simply be blended. See `spread`.
            let even = -Double.pi / 2 + u * tau
            let oriented = mid.angle + (even - mid.angle) * options.spread

            out.append(
                FacetPatch(
                    index: i,
                    start: start,
                    end: start + step,
                    position: mid.point,
                    normal: mid.angle,
                    angle: oriented + tilt,
                    // The tangent stays geometric — it is where the facet is
                    // drawn, not how it is lit.
                    tangent: mid.angle + .pi / 2,
                    u: u,
                    // Squared so most facets stay quiet and a few really pop.
                    sparkle: sparkleRaw * sparkleRaw
                )
            )
        }

        return out
    }

    /// Distribute weight 1.0 across the palette stops for a wrapped position.
    ///
    /// Exactly two adjacent stops are ever non-zero, which is what keeps the
    /// colour mixing cheap and matches the React Native renderer's layer model.
    public static func paletteWeights(u: Double, stops: Int, into out: inout [Double]) {
        for i in 0..<stops { out[i] = 0 }
        guard stops > 0 else { return }
        if stops == 1 {
            out[0] = 1
            return
        }

        var t = u.truncatingRemainder(dividingBy: 1)
        if t < 0 { t += 1 }
        let scaled = t * Double(stops)
        let lo = Int(scaled.rounded(.down)) % stops
        let hi = (lo + 1) % stops
        let f = scaled - scaled.rounded(.down)
        out[lo] += 1 - f
        out[hi] += f
    }

    /// Evaluate one facet at time `t` (seconds).
    public static func sample(
        facet: FacetPatch,
        time: Double,
        options: FacetOptions,
        stops: Int,
        weights: inout [Double],
        scratch: inout [Double]
    ) -> (total: Double, glint: Double) {
        for i in 0..<stops { weights[i] = 0 }

        let revolutions = time * options.speed
        let base = revolutions * tau
        let samples = max(1, options.samples)
        let share = 1 / Double(samples)

        var total = 0.0
        var glintAcc = 0.0

        for k in 0..<samples {
            // Chromatic samples straddle the light azimuth symmetrically.
            let offset = (Double(k) - Double(samples - 1) / 2) * options.dispersion
            let phi = base + offset

            let d = cos(facet.angle - phi)
            if d <= 0 { continue }

            let spec = pow(d, options.sharpness)
            let soft = d * d * options.bloom
            let contribution = (spec + soft) * share
            if contribution <= 0 { continue }

            paletteWeights(u: phi / tau + facet.u * options.swirl, stops: stops, into: &scratch)
            for i in 0..<stops { weights[i] += contribution * scratch[i] }
            total += contribution
            glintAcc += spec * spec * spec * share
        }

        // Ambient floor, coloured from the light's own position in the palette
        // so the unlit stretch of rim still drifts in hue rather than sitting
        // flat.
        if options.ambient > 0 {
            paletteWeights(u: base / tau + facet.u * options.swirl, stops: stops, into: &scratch)
            for i in 0..<stops { weights[i] += options.ambient * scratch[i] }
            total += options.ambient
        }

        // Slow whole-rim pulse, locked to the light revolution so the composite
        // animation stays periodic.
        let breathPhase = tau * revolutions * options.breathCycles
        let breath = 1 - options.breath + options.breath * (0.5 + 0.5 * cos(breathPhase))
        let gain = breath * options.intensity

        for i in 0..<stops { weights[i] *= gain }

        return (total * gain, glintAcc * facet.sparkle * options.glint * gain)
    }
}
