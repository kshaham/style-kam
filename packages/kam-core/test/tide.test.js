import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bakeTide,
  buildStretches,
  createRim,
  resolveGeometry,
  resolveTideOptions,
  sampleStretch,
  tideCycleDuration,
  tideDefaultOptions,
  tideLevels,
  tidePalettes,
  tidePresets,
} from "../dist/index.js";

const BOX = { w: 320, h: 200, r: 20 };
const rim = () => createRim(BOX.w, BOX.h, BOX.r);
const geo = (opts = tideDefaultOptions) => resolveGeometry(BOX.h, opts);

describe("tide levels", () => {
  const options = tideDefaultOptions;

  it("starts with the fronts parked outside the box", () => {
    const { lower, upper } = tideLevels(0, options, geo());
    assert.ok(lower > BOX.h, `lower front should start below the box, got ${lower}`);
    assert.ok(upper < 0, `upper front should start above the box, got ${upper}`);
  });

  it("closes the fronts toward each other, then reopens them", () => {
    const gap = (t) => {
      const { lower, upper } = tideLevels(t, options, geo());
      return lower - upper;
    };
    const cycle = tideCycleDuration(options);
    const start = gap(0);
    const closed = gap(cycle * 0.6);
    const reopened = gap(cycle * 0.99);
    assert.ok(closed < start, "fronts must approach");
    assert.ok(reopened > closed, "fronts must withdraw again");
  });

  it("peaks the kiss when the fronts are closest", () => {
    const cycle = tideCycleDuration(options);
    let best = 0;
    let bestPhase = 0;
    for (let i = 0; i <= 100; i++) {
      const k = tideLevels((cycle * i) / 100, options, geo()).kiss;
      if (k > best) { best = k; bestPhase = i / 100; }
    }
    assert.ok(best > 0.2, `kiss never fired, peak ${best}`);
    // The approach eases in over the first 60% of the cycle, so the meeting
    // lands at the end of it, not in the middle.
    assert.ok(bestPhase > 0.45 && bestPhase < 0.75, `kiss peaked at ${bestPhase}`);
  });

  it("repeats exactly once per cycle", () => {
    const cycle = tideCycleDuration(options);
    const a = tideLevels(0.7, options, geo());
    const b = tideLevels(0.7 + cycle, options, geo());
    assert.ok(Math.abs(a.lower - b.lower) < 1e-9);
    assert.ok(Math.abs(a.upper - b.upper) < 1e-9);
  });

  it("sends the fronts past each other when cross is set", () => {
    const cycle = tideCycleDuration(options);
    const plain = tideLevels(cycle * 0.6, options, geo());
    const crossed = tideLevels(
      cycle * 0.6,
      resolveTideOptions({ cross: 0.2 }),
      geo(resolveTideOptions({ cross: 0.2 })),
    );
    assert.ok(crossed.lower < plain.lower, "cross should carry the lower front further");
  });
});

describe("tide sampling", () => {
  const options = tideDefaultOptions;
  const stretches = buildStretches(rim());

  it("covers the rim without gaps", () => {
    for (let i = 1; i < stretches.length; i++) {
      assert.ok(Math.abs(stretches[i].s0 - stretches[i - 1].s1) < 1e-9);
    }
    assert.ok(Math.abs(stretches.at(-1).s1 - rim().length) < 1e-9);
  });

  it("never emits negative or non-finite light in any state", () => {
    for (const state of ["idle", "processing", "done", "error"]) {
      for (const stretch of stretches) {
        for (let step = 0; step < 16; step++) {
          const s = sampleStretch(stretch.x, stretch.y, step * 0.25, state, options, geo());
          assert.ok(Number.isFinite(s.alpha) && s.alpha >= 0, `${state} alpha ${s.alpha}`);
          assert.ok(Number.isFinite(s.white) && s.white >= 0, `${state} white ${s.white}`);
          assert.ok(s.crest >= 0 && s.crest <= 1.0001, `${state} crest ${s.crest}`);
        }
      }
    }
  });

  it("keeps the rim faintly lit even where no front is", () => {
    // The border must never stop existing, or the card looks broken mid-task.
    const cycle = tideCycleDuration(options);
    for (let step = 0; step < 24; step++) {
      const t = (cycle * step) / 24;
      const dimmest = Math.min(
        ...stretches.map((s) => sampleStretch(s.x, s.y, t, "processing", options, geo()).alpha),
      );
      assert.ok(dimmest > 0.02, `rim went dark at t=${t} (dimmest ${dimmest})`);
    }
  });

  it("throws its brightest light at the kiss", () => {
    const cycle = tideCycleDuration(options);
    const peakAt = (t) =>
      Math.max(...stretches.map((s) => sampleStretch(s.x, s.y, t, "processing", options, geo()).white));
    assert.ok(peakAt(cycle * 0.6) > peakAt(cycle * 0.05), "the meeting should be the payoff");
  });

  it("is quieter while idle than while processing", () => {
    const total = (state, t) =>
      stretches.reduce((sum, s) => sum + sampleStretch(s.x, s.y, t, state, options, geo()).alpha, 0);
    assert.ok(total("idle", 1) < total("processing", tideCycleDuration(options) * 0.6));
  });

  it("decays the done flash instead of holding it", () => {
    const at = (t) =>
      Math.max(...stretches.map((s) => sampleStretch(s.x, s.y, t, "done", options, geo()).crest));
    assert.ok(at(0.15) > at(2.5), "the success flash must radiate and settle");
  });

  it("double-flashes on error", () => {
    // Two pulses at ~0.07s and ~0.33s, with a trough between them.
    const at = (t) => sampleStretch(stretches[0].x, stretches[0].y, t, "error", options, geo()).alpha;
    assert.ok(at(0.07) > at(0.2), "first flash");
    assert.ok(at(0.33) > at(0.2), "second flash");
  });
});

describe("tide baking for React Native", () => {
  const options = tideDefaultOptions;
  const stretches = buildStretches(rim(), 16);
  const stops = tidePalettes.processing.length;

  it("produces a closed loop", () => {
    const baked = bakeTide(stretches, options, geo(), stops, 32);
    assert.equal(baked.frames.length, 33);
    for (const { curves } of baked.stretches) {
      for (const curve of curves) {
        assert.ok(Math.abs(curve[0] - curve[32]) < 1e-9, "loop point must match");
      }
    }
  });

  it("keeps keyframes monotonically increasing", () => {
    // Animated.interpolate requires this of its inputRange.
    const baked = bakeTide(stretches, options, geo(), stops, 24);
    for (let i = 1; i < baked.frames.length; i++) {
      assert.ok(baked.frames[i] > baked.frames[i - 1]);
    }
  });

  it("matches what the canvas renderer would draw", () => {
    // The two renderers must agree or a tuning approved on the web would not
    // survive the trip to a phone.
    const steps = 64;
    const baked = bakeTide(stretches, options, geo(), stops, steps, 0);
    const entry = baked.stretches[5];
    const step = 21;
    const s = sampleStretch(
      entry.stretch.x,
      entry.stretch.y,
      tideCycleDuration(options) * (step / steps),
      "processing",
      options,
      geo(),
    );
    const summed = entry.curves.slice(0, stops).reduce((a, c) => a + c[step], 0);
    assert.ok(Math.abs(summed - s.alpha) < 1e-9, `${summed} vs ${s.alpha}`);
    assert.ok(Math.abs(entry.curves[stops][step] - s.white) < 1e-9);
  });

  it("reports the duration the driver should loop over", () => {
    const baked = bakeTide(stretches, options, geo(), stops, 16);
    assert.ok(Math.abs(baked.duration - tideCycleDuration(options)) < 1e-9);
  });
});

describe("tide presets", () => {
  it("all resolve and light the rim", () => {
    for (const [name, partial] of Object.entries(tidePresets)) {
      const opts = resolveTideOptions(partial);
      const g = resolveGeometry(BOX.h, opts);
      const stretches = buildStretches(rim());
      let peak = 0;
      for (let step = 0; step < 24; step++) {
        const t = (tideCycleDuration(opts) * step) / 24;
        for (const s of stretches) {
          const v = sampleStretch(s.x, s.y, t, "processing", opts, g);
          if (v.alpha > peak) peak = v.alpha;
        }
      }
      assert.ok(peak > 0.2, `${name} never lights up (peak ${peak})`);
    }
  });

  it("gives every state a palette of at least two stops", () => {
    for (const [state, palette] of Object.entries(tidePalettes)) {
      assert.ok(palette.length >= 2, `${state} needs a palette`);
    }
  });

  it("ignores undefined overrides instead of erasing defaults", () => {
    const opts = resolveTideOptions({ speed: undefined, band: 2 });
    assert.equal(opts.speed, tideDefaultOptions.speed);
    assert.equal(opts.band, 2);
  });
});
