import CoreGraphics
import XCTest

@testable import Kam

final class RimTests: XCTestCase {
    func testPerimeterMatchesRoundedRectangleFormula() {
        let rim = Rim(size: CGSize(width: 200, height: 120), radius: 24)
        // Spelled out one term per line and explicitly typed: as a single
        // expression of untyped literals plus `.pi`, the type checker times out
        // and the whole test target fails to build.
        let horizontalEdges: Double = 2 * (200 - 2 * 24)
        let verticalEdges: Double = 2 * (120 - 2 * 24)
        let corners: Double = 2 * .pi * 24
        let expected = horizontalEdges + verticalEdges + corners
        XCTAssertEqual(rim.length, expected, accuracy: 1e-6)
    }

    func testRadiusIsClampedToHalfTheShorterSide() {
        let rim = Rim(size: CGSize(width: 100, height: 40), radius: 999)
        XCTAssertEqual(rim.radius, 20, accuracy: 1e-9)
    }

    func testArcLengthZeroSitsOnTheTopEdge() {
        let rim = Rim(size: CGSize(width: 200, height: 120), radius: 24)
        let p = rim.point(at: 0)
        XCTAssertEqual(p.point.y, 0, accuracy: 1e-6)
        XCTAssertEqual(p.angle, -.pi / 2, accuracy: 1e-6)
    }

    func testSamplingWrapsAroundThePerimeter() {
        let rim = Rim(size: CGSize(width: 200, height: 120), radius: 24)
        let a = rim.point(at: 17)
        let b = rim.point(at: 17 + rim.length)
        XCTAssertEqual(a.point.x, b.point.x, accuracy: 1e-6)
        XCTAssertEqual(a.point.y, b.point.y, accuracy: 1e-6)
    }

    func testEveryRimPointLiesOnTheBoundary() {
        let rim = Rim(size: CGSize(width: 180, height: 90), radius: 20)
        for i in 0..<400 {
            let p = rim.point(at: rim.length * Double(i) / 400).point
            XCTAssertGreaterThanOrEqual(Double(p.x), -1e-6)
            XCTAssertLessThanOrEqual(Double(p.x), 180 + 1e-6)
            XCTAssertGreaterThanOrEqual(Double(p.y), -1e-6)
            XCTAssertLessThanOrEqual(Double(p.y), 90 + 1e-6)
        }
    }
}

final class PaletteWeightTests: XCTestCase {
    func testWeightsSumToOne() {
        var out = [Double](repeating: 0, count: 3)
        for i in 0..<64 {
            FacetEngine.paletteWeights(u: Double(i) / 17 - 1.5, stops: 3, into: &out)
            XCTAssertEqual(out.reduce(0, +), 1, accuracy: 1e-9)
        }
    }

    func testAtMostTwoStopsAreEverLit() {
        var out = [Double](repeating: 0, count: 4)
        for i in 0..<64 {
            FacetEngine.paletteWeights(u: Double(i) / 9, stops: 4, into: &out)
            XCTAssertLessThanOrEqual(out.filter { $0 > 0 }.count, 2)
        }
    }

    func testWholeTurnsLandOnTheFirstStop() {
        var out = [Double](repeating: 0, count: 3)
        FacetEngine.paletteWeights(u: 2, stops: 3, into: &out)
        XCTAssertEqual(out[0], 1, accuracy: 1e-9)
    }
}

final class FacetEngineTests: XCTestCase {
    private let rim = Rim(size: CGSize(width: 240, height: 140), radius: 20)

    func testFacetsTileTheRimWithoutGaps() {
        let facets = FacetEngine.buildFacets(rim: rim, options: .default)
        XCTAssertEqual(facets.count, FacetOptions.default.facets)
        for i in 1..<facets.count {
            XCTAssertEqual(facets[i].start, facets[i - 1].end, accuracy: 1e-9)
        }
        XCTAssertEqual(facets.last!.end, rim.length, accuracy: 1e-9)
    }

    func testFacetLayoutIsDeterministicForASeed() {
        let a = FacetEngine.buildFacets(rim: rim, options: .default)
        let b = FacetEngine.buildFacets(rim: rim, options: .default)
        for (x, y) in zip(a, b) {
            XCTAssertEqual(x.angle, y.angle, accuracy: 1e-12)
            XCTAssertEqual(x.sparkle, y.sparkle, accuracy: 1e-12)
        }
    }

    func testDifferentSeedsProduceDifferentTilts() {
        var other = FacetOptions.default
        other.seed = 99
        let a = FacetEngine.buildFacets(rim: rim, options: .default)
        let b = FacetEngine.buildFacets(rim: rim, options: other)
        XCTAssertTrue(zip(a, b).contains { abs($0.angle - $1.angle) > 1e-6 })
    }

    func testScatterAndSpreadZeroLeaveFacetNormalsUntouched() {
        var options = FacetOptions.default
        options.scatter = 0
        options.spread = 0
        for facet in FacetEngine.buildFacets(rim: rim, options: options) {
            XCTAssertEqual(facet.angle, facet.normal, accuracy: 1e-9)
        }
    }

    func testSpreadOneDistributesOrientationsEvenly() {
        var options = FacetOptions.default
        options.scatter = 0
        options.spread = 1
        let facets = FacetEngine.buildFacets(rim: rim, options: options)
        let step = (2 * Double.pi) / Double(facets.count)
        for i in 1..<facets.count {
            XCTAssertEqual(facets[i].angle - facets[i - 1].angle, step, accuracy: 1e-9)
        }
    }

    func testSpreadDoesNotMoveWhereFacetsAreDrawn() {
        var flat = FacetOptions.default
        flat.spread = 0
        var even = FacetOptions.default
        even.spread = 1
        let a = FacetEngine.buildFacets(rim: rim, options: flat)
        let b = FacetEngine.buildFacets(rim: rim, options: even)
        for (x, y) in zip(a, b) {
            XCTAssertEqual(x.tangent, y.tangent, accuracy: 1e-12)
            XCTAssertEqual(x.position.x, y.position.x, accuracy: 1e-12)
            XCTAssertEqual(x.position.y, y.position.y, accuracy: 1e-12)
        }
    }

    /// Ratio between the dimmest and brightest the whole rim gets over a cycle.
    private func ripple(_ options: FacetOptions, _ rim: Rim) -> Double {
        let facets = FacetEngine.buildFacets(rim: rim, options: options)
        var weights = [Double](repeating: 0, count: 3)
        var scratch = [Double](repeating: 0, count: 3)
        var sums: [Double] = []

        for step in 0..<48 {
            let time = options.cycleDuration * Double(step) / 48
            var sum = 0.0
            for facet in facets {
                sum += FacetEngine.sample(
                    facet: facet, time: time, options: options, stops: 3,
                    weights: &weights, scratch: &scratch
                ).total
            }
            sums.append(sum)
        }

        let mn = sums.min() ?? 0
        let mx = sums.max() ?? 1
        return mx > 0 ? (mx - mn) / mx : 0
    }

    func testRimBrightnessIsSteadyAtSpreadOne() {
        var options = FacetOptions.default
        options.breath = 0
        options.spread = 1
        options.scatter = 0
        XCTAssertLessThan(ripple(options, rim), 0.02)
    }

    func testSpreadEvensOutEveryAspectRatio() {
        // Some ripple is wanted — that is the crystalline flicker `scatter`
        // produces — but how much of it you get must not depend on whether the
        // box is a wide banner or a tall tile.
        //
        // Note what is asserted and what is not. "Spread cuts ripple by at least
        // a quarter on every box" is NOT the claim and does not hold: a square
        // hides the least normal-angle variation in its corner arcs of any box,
        // so it starts near the target already (0.179 unspread, against 0.51 for
        // a 600x60 banner) and there is correspondingly little left to win —
        // measured 0.137, a 23% improvement. Demanding a fixed factor there
        // fails the engine for being right. The claim is that afterwards the
        // boxes agree with each other.
        let boxes = [
            CGSize(width: 240, height: 140),
            CGSize(width: 600, height: 60),
            CGSize(width: 80, height: 400),
            CGSize(width: 200, height: 200),
        ]

        var withSpread = FacetOptions.default
        withSpread.breath = 0
        var without = withSpread
        without.spread = 0

        var spread: [Double] = []
        var unspread: [Double] = []

        for box in boxes {
            let rect = Rim(size: box, radius: 20)
            let a = ripple(withSpread, rect)
            let b = ripple(without, rect)
            spread.append(a)
            unspread.append(b)
            XCTAssertLessThan(a, 0.55, "\(box) rippled \(a)")
            XCTAssertLessThanOrEqual(a, b, "\(box): spread made it worse (\(b) -> \(a))")
        }

        // The actual thesis, stated as a measurement: with spread on, every
        // aspect ratio ripples by about the same amount. Measured range 0.071.
        let range = (spread.max() ?? 0) - (spread.min() ?? 0)
        XCTAssertLessThan(range, 0.15, "ripple still depends on aspect ratio: \(spread)")

        // And the control: without it, the same four boxes disagree sharply, so
        // the assertion above is measuring something real rather than a constant.
        let unspreadRange = (unspread.max() ?? 0) - (unspread.min() ?? 0)
        XCTAssertGreaterThan(unspreadRange, range * 2, "unspread: \(unspread)")
    }

    func testOutputIsPeriodicOverTheCycle() {
        let options = FacetOptions.default
        let facet = FacetEngine.buildFacets(rim: rim, options: options)[5]
        var w1 = [Double](repeating: 0, count: 3)
        var w2 = [Double](repeating: 0, count: 3)
        var scratch = [Double](repeating: 0, count: 3)

        let a = FacetEngine.sample(
            facet: facet, time: 3.5, options: options, stops: 3,
            weights: &w1, scratch: &scratch
        )
        let b = FacetEngine.sample(
            facet: facet, time: 3.5 + options.cycleDuration, options: options, stops: 3,
            weights: &w2, scratch: &scratch
        )

        XCTAssertEqual(a.total, b.total, accuracy: 1e-9)
        XCTAssertEqual(a.glint, b.glint, accuracy: 1e-9)
        for i in 0..<3 { XCTAssertEqual(w1[i], w2[i], accuracy: 1e-9) }
    }

    func testWeightsSumToTheReportedTotal() {
        let options = FacetOptions.default
        let facets = FacetEngine.buildFacets(rim: rim, options: options)
        var weights = [Double](repeating: 0, count: 3)
        var scratch = [Double](repeating: 0, count: 3)

        for facet in facets {
            for step in 0..<12 {
                let result = FacetEngine.sample(
                    facet: facet,
                    time: options.cycleDuration * Double(step) / 12,
                    options: options,
                    stops: 3,
                    weights: &weights,
                    scratch: &scratch
                )
                XCTAssertEqual(weights.reduce(0, +), result.total, accuracy: 1e-9)
            }
        }
    }

    func testSomeFacetIsAlwaysLit() {
        let options = FacetOptions.default
        let facets = FacetEngine.buildFacets(rim: rim, options: options)
        var weights = [Double](repeating: 0, count: 3)
        var scratch = [Double](repeating: 0, count: 3)

        for step in 0..<24 {
            let time = options.cycleDuration * Double(step) / 24
            let brightest = facets.map { facet in
                FacetEngine.sample(
                    facet: facet, time: time, options: options, stops: 3,
                    weights: &weights, scratch: &scratch
                ).total
            }.max() ?? 0
            XCTAssertGreaterThan(brightest, 0.05, "rim went dark at t=\(time)")
        }
    }
}
