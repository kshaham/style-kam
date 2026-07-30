import CoreGraphics
import Foundation

/// The Tide engine.
///
/// Two waterlines travel toward the middle of the rim: `lower` climbs from
/// beneath the bottom edge, `upper` descends from above the top edge. Each
/// carries a meniscus — a narrow band of much brighter colour — and leaves a dim
/// body of colour behind it. The rim between them stays faintly lit so the
/// border never stops existing.
///
/// This is a direct transcription of `tide.ts` in `kam-core`. The numbers must
/// stay in step with it; `TideEngineTests` pins the ones that matter.
public enum TideState: String, CaseIterable, Sendable {
    case idle, processing, done, error

    /// Working palette per state. Terminal states carry their own meaning.
    public var hexColors: [String] {
        switch self {
        case .idle, .processing: return ["#22d3ee", "#818cf8", "#f0abfc", "#fda4af"]
        case .done: return ["#34d399", "#a7f3d0", "#22d3ee"]
        case .error: return ["#fb7185", "#fdba74", "#f43f5e"]
        }
    }
}

public struct TideOptions: Equatable, Sendable {
    /// Cycles per second. One cycle is close, kiss, withdraw.
    public var speed: Double
    /// Meniscus thickness, as a multiple of 5.5% of the box height.
    public var band: Double
    /// How far each front travels, in box heights.
    public var reach: Double
    /// Extra travel past the middle, so the fronts overshoot each other.
    public var cross: Double
    /// Strength of the flash thrown when the fronts pass.
    public var kiss: Double
    /// Output multiplier.
    public var intensity: Double

    public init(
        speed: Double = 1,
        band: Double = 1,
        reach: Double = 0.56,
        cross: Double = 0,
        kiss: Double = 1,
        intensity: Double = 1
    ) {
        self.speed = speed
        self.band = band
        self.reach = reach
        self.cross = cross
        self.kiss = kiss
        self.intensity = intensity
    }

    public static let `default` = TideOptions()

    // Reviewed tunings, matching `tidePresets` in kam-core.

    /// Wide, slow and low-contrast. For long operations that should not invite
    /// being watched.
    public static let calm = TideOptions(speed: 0.62, band: 1.7, reach: 0.5, kiss: 0.65)
    /// Thin core, tight glow, quick cycle. For short operations, where the kiss
    /// needs to land before attention moves on.
    public static let precise = TideOptions(speed: 1.45, band: 0.55, kiss: 1.5)
    /// Wide bloom and enough `cross` that the fronts overshoot rather than
    /// merely touching. The most physical of the three.
    public static let deep = TideOptions(speed: 0.9, band: 1.15, cross: 0.17, kiss: 1.1)

    /// One cycle in seconds.
    public var cycleDuration: Double {
        abs(speed) > 1e-6 ? 3.6 / abs(speed) : 0
    }
}

public struct TideSample: Sendable {
    /// Palette lookup position, in turns.
    public var u: Double
    /// 0...1 — how close this stretch is to a meniscus. Drives line width.
    public var crest: Double
    /// Colour opacity for the stretch.
    public var alpha: Double
    /// White opacity laid over the crest.
    public var white: Double
}

public struct TideEngine: Sendable {
    public let options: TideOptions
    /// Box height in points — the axis both fronts travel along.
    public let height: Double

    public init(options: TideOptions, height: Double) {
        self.options = options
        self.height = height
    }

    /// Meniscus half-thickness in points, derived from `band`.
    public var band: Double { max(6, height * 0.055 * options.band) }

    /// Front positions at time `t`, in box-local y.
    ///
    /// The approach is fast and the withdrawal is eased, because a slow
    /// separation looks like failure while a slow approach looks like effort.
    public func levels(at t: Double) -> (lower: Double, upper: Double, kiss: Double) {
        let cycle = options.cycleDuration
        guard cycle > 0 else { return (height * 1.06, -height * 0.06, 0) }
        let phase = (t / cycle).truncatingRemainder(dividingBy: 1)
        let settle = phase < 0.6
            ? 1 - pow(1 - phase / 0.6, 3)
            : 1 - (0.5 - 0.5 * cos(.pi * (phase - 0.6) / 0.4))
        let travel = height * (options.reach + options.cross) * settle
        let lower = height * 1.06 - travel
        let upper = -height * 0.06 + travel
        // Squared so the flash is confined to the moment of passing.
        let kiss = pow(max(0, 1 - abs(lower - upper) / (band * 2.4)), 2) * options.kiss
        return (lower, upper, kiss)
    }

    /// Evaluate the stretch of rim whose midpoint is (x, y).
    ///
    /// `state` replaces the travelling fronts with their lifecycle
    /// equivalents: parked at the edges while idle, merged and radiating on
    /// success, held and flashing on failure. `t` restarts at 0 on every state
    /// change.
    public func sample(x: Double, y: Double, t: Double, state: TideState) -> TideSample {
        let gain = options.intensity
        let mid = height / 2

        switch state {
        case .idle:
            let breath = 0.5 + 0.5 * cos(t * 0.85)
            let edge = max(0, 1 - min(y, height - y) / (height * 0.3))
            return TideSample(
                u: (y / height) * 0.3 + 0.05,
                crest: 0,
                alpha: (0.055 + 0.1 * edge * (0.55 + 0.45 * breath)) * gain,
                white: 0
            )

        case .done:
            let spread = min(1.25, t * 1.9)
            let hold = 0.17 + 0.045 * sin(t * 1.05)
            let dist = abs(y - mid) / mid
            let ring = exp(-pow((dist - spread) / 0.34, 2)) * exp(-t * 1.5)
            let opening = exp(-t * 3.4) * max(0, 1 - dist * 4)
            let crest = max(ring, opening)
            return TideSample(
                u: 0.1 + dist * 0.3 + t * 0.03,
                crest: crest,
                alpha: (hold + 0.7 * crest) * gain,
                white: crest > 0.55 ? 0.55 * pow(crest, 3) : 0
            )

        case .error:
            let flash = min(
                1,
                exp(-pow((t - 0.07) / 0.1, 2)) + exp(-pow((t - 0.33) / 0.1, 2))
            )
            return TideSample(
                u: 0.05 + (y / height) * 0.35,
                crest: 0.5 * flash,
                alpha: (0.18 + 0.03 * sin(t * 2.4) + 0.5 * flash) * gain,
                white: 0
            )

        case .processing:
            let l = levels(at: t)
            // Two out-of-phase wobbles per front; horizontal position drives
            // them so the waterline ripples along its own length instead of
            // shimmying as a unit.
            let wobA = sin(x * 0.05 + t * 2.3) * 2.4 + sin(x * 0.018 - t * 1.4) * 3.2
            let wobB = sin(x * 0.043 - t * 2.0) * 2.4 + sin(x * 0.021 + t * 1.2) * 3.2
            let dLower = y - (l.lower + wobA)
            let dUpper = (l.upper + wobB) - y
            let cLower = max(0, 1 - abs(dLower) / band)
            let cUpper = max(0, 1 - abs(dUpper) / band)
            let body = (dLower > 0 ? 0.2 : 0) + (dUpper > 0 ? 0.2 : 0)
            let crest = max(cLower, cUpper)
            let both = cLower > 0.35 && cUpper > 0.35
            return TideSample(
                u: (dUpper > 0 ? 0.55 : 0.05) + (y / height) * 0.32 + t * 0.05,
                crest: crest,
                alpha: (0.05 + body + 0.78 * (cLower * cLower + cUpper * cUpper)
                        + 0.3 * l.kiss * crest) * gain,
                white: both && l.kiss > 0.05
                    ? min(1, 0.7 * l.kiss)
                    : (crest > 0.55 ? 0.55 * pow(crest, 3) : 0)
            )
        }
    }
}

/// One stretch of rim: arc-length bounds plus the midpoint they surround.
public struct TideStretch: Sendable {
    public let s0: Double
    public let s1: Double
    public let position: CGPoint
}

extension Rim {
    /// Cut the rim into stretches roughly `step` points long.
    public func stretches(step: Double = 6) -> [TideStretch] {
        let count = max(24, Int((length / step).rounded(.up)))
        var out: [TideStretch] = []
        out.reserveCapacity(count)
        for i in 0..<count {
            let s0 = Double(i) * length / Double(count)
            let s1 = Double(i + 1) * length / Double(count)
            out.append(TideStretch(s0: s0, s1: s1, position: point(at: (s0 + s1) / 2).point))
        }
        return out
    }
}
