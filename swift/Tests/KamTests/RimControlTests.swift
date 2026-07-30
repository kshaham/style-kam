import CoreGraphics
import SwiftUI
import XCTest

@testable import Kam

/// Coverage for the renderer-side controls, which the engine tests do not reach:
/// how a rim is composited, whether it is running, how far its halo reaches, and
/// what shape it traces.
final class BlendModeTests: XCTestCase {
    /// `.plusLighter` is the effect as designed and must stay the default, or
    /// every existing caller silently changes appearance on upgrade.
    func testBothViewsDefaultToAdditiveBlending() {
        XCTAssertEqual(TideView().blendMode, .plusLighter)
        XCTAssertEqual(FacetView().blendMode, .plusLighter)
    }

    /// The reason the parameter exists: additive blending on a pale surface
    /// clamps toward white, so a light theme has to opt out.
    func testBlendModeIsCarriedThrough() {
        XCTAssertEqual(TideView(blendMode: .normal).blendMode, .normal)
        XCTAssertEqual(FacetView(blendMode: .normal).blendMode, .normal)
    }
}

final class PausedTests: XCTestCase {
    func testTideRunsByDefaultAndPausesOnRequest() {
        XCTAssertFalse(TideView().paused)
        XCTAssertTrue(TideView(paused: true).paused)
    }

    func testFacetRunsByDefaultAndPausesOnRequest() {
        XCTAssertFalse(FacetView().paused)
        XCTAssertTrue(FacetView(paused: true).paused)
    }
}

final class HaloExtentTests: XCTestCase {
    /// With no glow there are no blurred passes, so the canvas only has to make
    /// room for half the core stroke.
    func testNoGlowReachesOnlyHalfTheCoreWidth() {
        let view = TideView(thickness: 1.5, glow: 0)
        XCTAssertEqual(view.haloExtent, (1.5 * 7) / 2, accuracy: 1e-9)
        XCTAssertEqual(view.margin, 6, accuracy: 1e-9)
    }

    /// The default is large — 46pt per side — which is the number that decides
    /// whether a host's padding can contain the glow.
    func testDefaultGlowReachesFarPastTheBox() {
        let view = TideView(thickness: 1.5, glow: 9)
        XCTAssertEqual(view.haloExtent, 9 * 1.8 * 2.5 + (1.5 * 7) / 2, accuracy: 1e-9)
        XCTAssertEqual(view.margin, 46, accuracy: 1e-9)
    }

    /// Tide and Facet must size their bleed alike, since they are documented as
    /// interchangeable on the same surface.
    func testTideAndFacetAgreeOnReach() {
        XCTAssertEqual(
            TideView(thickness: 2, glow: 5).haloExtent,
            FacetView(thickness: 2, glow: 5).haloExtent,
            accuracy: 1e-9
        )
    }

    func testExplicitBleedOverridesTheComputedReach() {
        XCTAssertEqual(TideView(glow: 9, bleed: 4).margin, 4, accuracy: 1e-9)
        // Never negative, however the caller abuses it.
        XCTAssertEqual(TideView(bleed: -50).margin, 0, accuracy: 1e-9)
    }
}

final class RimShapeTests: XCTestCase {
    /// The claim the capsule case rests on: an out-of-range radius is clamped to
    /// half the shorter side rather than rejected, so `.infinity` traces a true
    /// capsule and needs no measurement from the caller.
    func testInfiniteRadiusBecomesACapsule() {
        let rim = Rim(size: CGSize(width: 200, height: 44), radius: .infinity)
        XCTAssertEqual(rim.radius, 22, accuracy: 1e-9)
    }

    /// And on a square, the same request is a circle.
    func testInfiniteRadiusOnASquareBecomesACircle() {
        let rim = Rim(size: CGSize(width: 60, height: 60), radius: .infinity)
        XCTAssertEqual(rim.radius, 30, accuracy: 1e-9)
        // A circle's perimeter, not a rounded rectangle's.
        XCTAssertEqual(rim.length, 2 * .pi * 30, accuracy: 1e-6)
    }

    func testNegativeRadiusIsASharpCorner() {
        let rim = Rim(size: CGSize(width: 100, height: 50), radius: -10)
        XCTAssertEqual(rim.radius, 0, accuracy: 1e-9)
    }
}

final class ColorComponentTests: XCTestCase {
    /// A palette stop authored below full opacity is an instruction to draw that
    /// stretch fainter. Discarding alpha promoted every such stop to full.
    func testAlphaSurvivesTheRoundTrip() {
        let components = Color(.sRGB, red: 0.2, green: 0.4, blue: 0.6, opacity: 0.5).rgbaComponents
        XCTAssertEqual(components.0, 0.2, accuracy: 1e-6)
        XCTAssertEqual(components.1, 0.4, accuracy: 1e-6)
        XCTAssertEqual(components.2, 0.6, accuracy: 1e-6)
        XCTAssertEqual(components.3, 0.5, accuracy: 1e-6)
    }

    func testOpaqueColoursReportFullAlpha() {
        XCTAssertEqual(Color(hex: "#3366cc").rgbaComponents.3, 1, accuracy: 1e-6)
    }

    func testHexParsesTheFormsThePresetsUse() {
        let (r, g, b, a) = Color(hex: "#3366cc").rgbaComponents
        XCTAssertEqual(r, 0x33 / 255.0, accuracy: 1e-6)
        XCTAssertEqual(g, 0x66 / 255.0, accuracy: 1e-6)
        XCTAssertEqual(b, 0xCC / 255.0, accuracy: 1e-6)
        XCTAssertEqual(a, 1, accuracy: 1e-6)
    }

    /// Every shipped preset hex must parse to the colour it spells, since a typo
    /// would otherwise reach a screen as silent white.
    ///
    /// Checked against an independent decode rather than against white: `diamond`
    /// genuinely ships `#ffffff`, so "came out white" cannot tell a real stop from
    /// a parse failure.
    func testEveryPresetPaletteParses() {
        func assertDecodes(_ hex: String, _ label: String) {
            let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
            guard digits.count == 6, let raw = UInt32(digits, radix: 16) else {
                return XCTFail("\(label) stop \(hex) is not a 6-digit hex")
            }
            let (r, g, b, a) = Color(hex: hex).rgbaComponents
            XCTAssertEqual(r, Double((raw >> 16) & 0xFF) / 255, accuracy: 1e-6, "\(label) \(hex) red")
            XCTAssertEqual(g, Double((raw >> 8) & 0xFF) / 255, accuracy: 1e-6, "\(label) \(hex) green")
            XCTAssertEqual(b, Double(raw & 0xFF) / 255, accuracy: 1e-6, "\(label) \(hex) blue")
            XCTAssertEqual(a, 1, accuracy: 1e-6, "\(label) \(hex) alpha")
        }

        for preset in FacetPreset.allCases {
            for hex in preset.hexColors { assertDecodes(hex, preset.rawValue) }
        }
        for state in TideState.allCases {
            for hex in state.hexColors { assertDecodes(hex, state.rawValue) }
        }
    }
}
