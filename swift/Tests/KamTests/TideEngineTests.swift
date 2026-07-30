import CoreGraphics
import XCTest

@testable import Kam

/// These mirror `packages/kam-core/test/tide.test.js` case for case. The Swift
/// engine is a transcription, so any drift between the two shows up here first.
final class TideLevelTests: XCTestCase {
    private let height = 200.0
    private var engine: TideEngine { TideEngine(options: .default, height: height) }

    func testFrontsStartOutsideTheBox() {
        let l = engine.levels(at: 0)
        XCTAssertGreaterThan(l.lower, height, "lower front should start below the box")
        XCTAssertLessThan(l.upper, 0, "upper front should start above the box")
    }

    func testFrontsCloseThenReopen() {
        let cycle = TideOptions.default.cycleDuration
        let gap = { (t: Double) -> Double in
            let l = self.engine.levels(at: t)
            return l.lower - l.upper
        }
        XCTAssertLessThan(gap(cycle * 0.6), gap(0), "fronts must approach")
        XCTAssertGreaterThan(gap(cycle * 0.99), gap(cycle * 0.6), "fronts must withdraw")
    }

    func testKissPeaksWhenFrontsAreClosest() {
        let cycle = TideOptions.default.cycleDuration
        var best = 0.0
        var bestPhase = 0.0
        for i in 0...100 {
            let k = engine.levels(at: cycle * Double(i) / 100).kiss
            if k > best { best = k; bestPhase = Double(i) / 100 }
        }
        XCTAssertGreaterThan(best, 0.2, "kiss never fired")
        XCTAssertTrue(bestPhase > 0.45 && bestPhase < 0.75, "kiss peaked at \(bestPhase)")
    }

    func testLevelsRepeatOncePerCycle() {
        let cycle = TideOptions.default.cycleDuration
        let a = engine.levels(at: 0.7)
        let b = engine.levels(at: 0.7 + cycle)
        XCTAssertEqual(a.lower, b.lower, accuracy: 1e-9)
        XCTAssertEqual(a.upper, b.upper, accuracy: 1e-9)
    }

    func testCrossCarriesFrontsPastEachOther() {
        let cycle = TideOptions.default.cycleDuration
        var crossed = TideOptions.default
        crossed.cross = 0.2
        let plain = engine.levels(at: cycle * 0.6).lower
        let past = TideEngine(options: crossed, height: height).levels(at: cycle * 0.6).lower
        XCTAssertLessThan(past, plain)
    }
}

final class TideSampleTests: XCTestCase {
    private let rim = Rim(size: CGSize(width: 320, height: 200), radius: 20)
    private var engine: TideEngine { TideEngine(options: .default, height: 200) }

    func testStretchesCoverTheRimWithoutGaps() {
        let stretches = rim.stretches()
        for i in 1..<stretches.count {
            XCTAssertEqual(stretches[i].s0, stretches[i - 1].s1, accuracy: 1e-9)
        }
        XCTAssertEqual(stretches.last!.s1, rim.length, accuracy: 1e-9)
    }

    func testNoNegativeOrNonFiniteLightInAnyState() {
        for state in TideState.allCases {
            for stretch in rim.stretches() {
                for step in 0..<16 {
                    let s = engine.sample(
                        x: Double(stretch.position.x),
                        y: Double(stretch.position.y),
                        t: Double(step) * 0.25,
                        state: state
                    )
                    XCTAssertTrue(s.alpha.isFinite && s.alpha >= 0, "\(state) alpha \(s.alpha)")
                    XCTAssertTrue(s.white.isFinite && s.white >= 0, "\(state) white \(s.white)")
                    XCTAssertTrue(s.crest >= 0 && s.crest <= 1.0001, "\(state) crest \(s.crest)")
                }
            }
        }
    }

    func testRimStaysFaintlyLitThroughout() {
        // The border must never stop existing, or the card looks broken.
        let cycle = TideOptions.default.cycleDuration
        for step in 0..<24 {
            let t = cycle * Double(step) / 24
            let dimmest = rim.stretches().map {
                engine.sample(x: Double($0.position.x), y: Double($0.position.y), t: t, state: .processing).alpha
            }.min() ?? 0
            XCTAssertGreaterThan(dimmest, 0.02, "rim went dark at t=\(t)")
        }
    }

    func testBrightestLightIsAtTheKiss() {
        let cycle = TideOptions.default.cycleDuration
        let peak = { (t: Double) -> Double in
            self.rim.stretches().map {
                self.engine.sample(x: Double($0.position.x), y: Double($0.position.y), t: t, state: .processing).white
            }.max() ?? 0
        }
        XCTAssertGreaterThan(peak(cycle * 0.6), peak(cycle * 0.05))
    }

    func testIdleIsQuieterThanProcessing() {
        let total = { (state: TideState, t: Double) -> Double in
            self.rim.stretches().reduce(0) {
                $0 + self.engine.sample(x: Double($1.position.x), y: Double($1.position.y), t: t, state: state).alpha
            }
        }
        XCTAssertLessThan(
            total(.idle, 1),
            total(.processing, TideOptions.default.cycleDuration * 0.6)
        )
    }

    func testDoneFlashDecays() {
        let at = { (t: Double) -> Double in
            self.rim.stretches().map {
                self.engine.sample(x: Double($0.position.x), y: Double($0.position.y), t: t, state: .done).crest
            }.max() ?? 0
        }
        XCTAssertGreaterThan(at(0.15), at(2.5), "the success flash must radiate and settle")
    }

    func testErrorDoubleFlashes() {
        let p = rim.stretches()[0].position
        let at = { (t: Double) -> Double in
            self.engine.sample(x: Double(p.x), y: Double(p.y), t: t, state: .error).alpha
        }
        XCTAssertGreaterThan(at(0.07), at(0.2), "first flash")
        XCTAssertGreaterThan(at(0.33), at(0.2), "second flash")
    }

    func testPresetsAllLightTheRim() {
        for (name, options) in [
            ("calm", TideOptions.calm), ("precise", .precise), ("deep", .deep),
        ] {
            let e = TideEngine(options: options, height: 200)
            var peak = 0.0
            for step in 0..<24 {
                let t = options.cycleDuration * Double(step) / 24
                for stretch in rim.stretches() {
                    peak = max(peak, e.sample(
                        x: Double(stretch.position.x), y: Double(stretch.position.y),
                        t: t, state: .processing
                    ).alpha)
                }
            }
            XCTAssertGreaterThan(peak, 0.2, "\(name) never lights up")
        }
    }

    func testEveryStateHasAPalette() {
        for state in TideState.allCases {
            XCTAssertGreaterThanOrEqual(state.hexColors.count, 2, "\(state) needs a palette")
        }
    }
}
