import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bakeCycle,
  buildFacets,
  createRim,
  createSample,
  cycleDuration,
  defaultOptions,
  mixPalette,
  paletteWeights,
  parseColor,
  parsePalette,
  presets,
  resolveOptions,
  rimPointAt,
  sampleFacet,
} from "../dist/index.js";

const rim = () => createRim(240, 140, 20);

describe("rim geometry", () => {
  it("matches the rounded-rectangle perimeter formula", () => {
    const r = createRim(200, 120, 24);
    const expected = 2 * (200 - 48) + 2 * (120 - 48) + 2 * Math.PI * 24;
    assert.ok(Math.abs(r.length - expected) < 1e-9);
  });

  it("clamps the radius to half the shorter side", () => {
    assert.equal(createRim(100, 40, 999).radius, 20);
  });

  it("degrades to a plain rectangle at radius 0", () => {
    const r = createRim(100, 50, 0);
    assert.ok(Math.abs(r.length - 300) < 1e-9);
  });

  it("puts arc-length 0 on the top edge", () => {
    const p = rimPointAt(createRim(200, 120, 24), 0);
    assert.ok(Math.abs(p.y) < 1e-9);
    assert.ok(Math.abs(p.angle - -Math.PI / 2) < 1e-9);
  });

  it("wraps around the perimeter", () => {
    const r = rim();
    const a = rimPointAt(r, 17);
    const b = rimPointAt(r, 17 + r.length);
    const c = rimPointAt(r, 17 - r.length);
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
    assert.ok(Math.abs(a.x - c.x) < 1e-9 && Math.abs(a.y - c.y) < 1e-9);
  });

  it("keeps every sampled point on the boundary", () => {
    const r = createRim(180, 90, 20);
    for (let i = 0; i < 500; i++) {
      const p = rimPointAt(r, (r.length * i) / 500);
      assert.ok(p.x >= -1e-9 && p.x <= 180 + 1e-9, `x out of box: ${p.x}`);
      assert.ok(p.y >= -1e-9 && p.y <= 90 + 1e-9, `y out of box: ${p.y}`);
    }
  });

  it("returns unit normals everywhere", () => {
    const r = rim();
    for (let i = 0; i < 200; i++) {
      const p = rimPointAt(r, (r.length * i) / 200);
      assert.ok(Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-9);
    }
  });

  it("survives a degenerate box", () => {
    const p = rimPointAt(createRim(0, 0, 0), 5);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
  });
});

describe("colour", () => {
  it("parses hex in every common length", () => {
    assert.deepEqual(parseColor("#f0a"), { r: 255, g: 0, b: 170 });
    assert.deepEqual(parseColor("#ff00aa"), { r: 255, g: 0, b: 170 });
    assert.deepEqual(parseColor("ff00aa"), { r: 255, g: 0, b: 170 });
    assert.deepEqual(parseColor("#ff00aa80"), { r: 255, g: 0, b: 170 });
  });

  it("parses rgb() and rgba()", () => {
    assert.deepEqual(parseColor("rgb(12, 34, 56)"), { r: 12, g: 34, b: 56 });
    assert.deepEqual(parseColor("rgba(12 34 56 / 0.5)"), { r: 12, g: 34, b: 56 });
  });

  it("falls back to white rather than throwing", () => {
    assert.deepEqual(parseColor("chartreuse"), { r: 255, g: 255, b: 255 });
  });

  it("distributes palette weights that sum to one", () => {
    const out = [0, 0, 0];
    for (let i = 0; i < 120; i++) {
      paletteWeights(i / 17 - 3.5, 3, out);
      assert.ok(Math.abs(out.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    }
  });

  it("lights at most two adjacent stops at a time", () => {
    // This is what lets React Native reproduce the mix with opacity alone.
    const out = [0, 0, 0, 0];
    for (let i = 0; i < 120; i++) {
      paletteWeights(i / 9, 4, out);
      assert.ok(out.filter((w) => w > 0).length <= 2);
    }
  });

  it("lands whole turns on the first stop", () => {
    const out = [0, 0, 0];
    paletteWeights(2, 3, out);
    assert.ok(Math.abs(out[0] - 1) < 1e-9);
  });

  it("handles a single-stop palette", () => {
    const out = [0];
    paletteWeights(0.4, 1, out);
    assert.equal(out[0], 1);
  });

  it("mixes palette stops by weight", () => {
    const palette = parsePalette(["#000000", "#ffffff"]);
    const mixed = mixPalette(palette, [0.5, 0.5]);
    assert.ok(Math.abs(mixed.r - 127.5) < 1e-9);
  });
});

describe("facet layout", () => {
  it("tiles the rim without gaps or overlap", () => {
    const r = rim();
    const facets = buildFacets(r, defaultOptions);
    assert.equal(facets.length, defaultOptions.facets);
    for (let i = 1; i < facets.length; i++) {
      assert.ok(Math.abs(facets[i].start - facets[i - 1].end) < 1e-9);
    }
    assert.ok(Math.abs(facets[facets.length - 1].end - r.length) < 1e-9);
  });

  it("is deterministic for a given seed", () => {
    const a = buildFacets(rim(), defaultOptions);
    const b = buildFacets(rim(), defaultOptions);
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].angle, b[i].angle);
      assert.equal(a[i].sparkle, b[i].sparkle);
    }
  });

  it("changes the cut when the seed changes", () => {
    const a = buildFacets(rim(), defaultOptions);
    const b = buildFacets(rim(), resolveOptions({ seed: 99 }));
    assert.ok(a.some((f, i) => Math.abs(f.angle - b[i].angle) > 1e-6));
  });

  it("leaves normals untouched at scatter 0 and spread 0", () => {
    for (const f of buildFacets(rim(), resolveOptions({ scatter: 0, spread: 0 }))) {
      assert.ok(Math.abs(f.angle - f.normal) < 1e-9);
    }
  });

  it("distributes orientations evenly at spread 1", () => {
    // Every facet should sit one even step further round than the last,
    // regardless of how the box's geometry bunches up its true normals.
    const facets = buildFacets(rim(), resolveOptions({ scatter: 0, spread: 1 }));
    const step = (2 * Math.PI) / facets.length;
    for (let i = 1; i < facets.length; i++) {
      assert.ok(Math.abs(facets[i].angle - facets[i - 1].angle - step) < 1e-9);
    }
  });

  it("keeps the drawn tangent geometric whatever the spread", () => {
    const a = buildFacets(rim(), resolveOptions({ spread: 0 }));
    const b = buildFacets(rim(), resolveOptions({ spread: 1 }));
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].tangent, b[i].tangent);
      assert.equal(a[i].x, b[i].x);
      assert.equal(a[i].y, b[i].y);
    }
  });

  it("keeps sparkle in range", () => {
    for (const f of buildFacets(rim(), defaultOptions)) {
      assert.ok(f.sparkle >= 0 && f.sparkle <= 1);
    }
  });

  it("enforces a floor of three facets", () => {
    assert.equal(buildFacets(rim(), resolveOptions({ facets: 1 })).length, 3);
  });
});

describe("sampling", () => {
  const options = defaultOptions;
  const facets = buildFacets(rim(), options);

  it("repeats exactly once per cycle", () => {
    const facet = facets[5];
    const a = sampleFacet(facet, 3.5, options, 3, createSample(3));
    const b = sampleFacet(
      facet,
      3.5 + cycleDuration(options),
      options,
      3,
      createSample(3),
    );
    assert.ok(Math.abs(a.total - b.total) < 1e-9);
    assert.ok(Math.abs(a.glint - b.glint) < 1e-9);
    a.weights.forEach((w, i) => assert.ok(Math.abs(w - b.weights[i]) < 1e-9));
  });

  it("reports a total equal to the sum of its weights", () => {
    const sample = createSample(3);
    for (const facet of facets) {
      for (let step = 0; step < 16; step++) {
        const s = sampleFacet(
          facet,
          (cycleDuration(options) * step) / 16,
          options,
          3,
          sample,
        );
        const sum = s.weights.reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - s.total) < 1e-9);
      }
    }
  });

  it("never emits negative or non-finite light", () => {
    const sample = createSample(3);
    for (const facet of facets) {
      for (let step = 0; step < 32; step++) {
        const s = sampleFacet(
          facet,
          (cycleDuration(options) * step) / 32,
          options,
          3,
          sample,
        );
        assert.ok(Number.isFinite(s.total) && s.total >= 0);
        assert.ok(Number.isFinite(s.glint) && s.glint >= 0);
        for (const w of s.weights) assert.ok(Number.isFinite(w) && w >= 0);
      }
    }
  });

  it("keeps some part of the rim lit at all times", () => {
    const sample = createSample(3);
    for (let step = 0; step < 48; step++) {
      const t = (cycleDuration(options) * step) / 48;
      let brightest = 0;
      for (const facet of facets) {
        const s = sampleFacet(facet, t, options, 3, sample);
        if (s.total > brightest) brightest = s.total;
      }
      assert.ok(brightest > 0.05, `rim went dark at t=${t}`);
    }
  });

  it("scales linearly with intensity", () => {
    const a = sampleFacet(facets[3], 1.25, options, 3, createSample(3)).total;
    const b = sampleFacet(
      facets[3],
      1.25,
      resolveOptions({ intensity: 2 }),
      3,
      createSample(3),
    ).total;
    assert.ok(Math.abs(b - a * 2) < 1e-9);
  });

  it("drops the glint entirely when glint is 0", () => {
    const sample = createSample(3);
    const opts = resolveOptions({ glint: 0 });
    for (const facet of facets) {
      assert.equal(sampleFacet(facet, 2.2, opts, 3, sample).glint, 0);
    }
  });

  /** Total light emitted by the whole rim, sampled across one cycle. */
  const rimBrightnessRange = (opts, r = rim()) => {
    const set = buildFacets(r, opts);
    const sample = createSample(3);
    const sums = [];
    for (let step = 0; step < 48; step++) {
      const t = (cycleDuration(opts) * step) / 48;
      let sum = 0;
      for (const facet of set) sum += sampleFacet(facet, t, opts, 3, sample).total;
      sums.push(sum);
    }
    const min = Math.min(...sums);
    const max = Math.max(...sums);
    return { min, max, ripple: (max - min) / max };
  };

  it("holds a near-constant brightness at spread 1 with breath off", () => {
    // Facet orientations are evenly distributed, so the same amount of light is
    // in play no matter where the light is pointing.
    const { ripple } = rimBrightnessRange(
      resolveOptions({ breath: 0, ambient: 0, spread: 1, scatter: 0 }),
    );
    assert.ok(ripple < 0.02, `ripple ${ripple}`);
  });

  it("flares edge-by-edge at spread 0", () => {
    // Straight edges share a normal, so a whole edge lights at once and the
    // diagonals between edges go dim. This is the look `spread` trades away.
    const { ripple } = rimBrightnessRange(
      resolveOptions({ breath: 0, ambient: 0, spread: 0 }),
    );
    assert.ok(ripple > 0.4, `expected edge flare, got ripple ${ripple}`);
  });

  it("shimmers alike across wildly different aspect ratios by default", () => {
    // The point of the default spread. Some ripple is wanted — that is the
    // crystalline flicker `scatter` produces — but how much of it you get must
    // not depend on whether the box is a wide banner or a tall tile.
    const boxes = [
      [240, 140],
      [600, 60],
      [80, 400],
      [200, 200],
    ];

    const rippleFor = (spread) =>
      boxes.map(([w, h]) =>
        rimBrightnessRange(
          resolveOptions({ breath: 0, ambient: 0, spread }),
          createRim(w, h, 20),
        ).ripple,
      );

    // How much the ripple itself varies from shape to shape is the thing that
    // has to shrink. A square is nearly isotropic already and barely improves;
    // a 10:1 banner is the case that needs the help.
    const consistency = (values) => Math.max(...values) / Math.min(...values);

    const tuned = rippleFor(defaultOptions.spread);
    const raw = rippleFor(0);

    assert.ok(
      consistency(tuned) < consistency(raw) * 0.8,
      `spread did not even out the aspect ratios: ${consistency(raw)} -> ${consistency(tuned)}`,
    );
    assert.ok(
      Math.max(...tuned) < 0.55,
      `some shape rippled too hard: ${tuned.join(", ")}`,
    );
  });
});

describe("baking for React Native", () => {
  const options = defaultOptions;
  const facets = buildFacets(rim(), options);

  it("produces a closed loop", () => {
    const baked = bakeCycle(facets, options, 3, { steps: 32 });
    assert.equal(baked.frames.length, 33);
    assert.equal(baked.frames[0], 0);
    assert.equal(baked.frames[32], 1);
    for (const { layers } of baked.facets) {
      for (const layer of layers) {
        assert.equal(layer.values.length, 33);
        // First and last keyframe must agree or the loop visibly jumps.
        assert.ok(Math.abs(layer.values[0] - layer.values[32]) < 1e-9);
      }
    }
  });

  it("keeps keyframes monotonically increasing", () => {
    // Animated.interpolate requires this of its inputRange.
    const baked = bakeCycle(facets, options, 3, { steps: 24 });
    for (let i = 1; i < baked.frames.length; i++) {
      assert.ok(baked.frames[i] > baked.frames[i - 1]);
    }
  });

  it("clamps opacities into 0..1", () => {
    const baked = bakeCycle(facets, resolveOptions({ intensity: 6 }), 3, {
      steps: 24,
    });
    for (const { layers } of baked.facets) {
      for (const layer of layers) {
        for (const v of layer.values) assert.ok(v >= 0 && v <= 1);
      }
    }
  });

  it("drops layers that never light up", () => {
    const baked = bakeCycle(facets, resolveOptions({ glint: 0 }), 3, {
      steps: 24,
    });
    for (const { layers } of baked.facets) {
      assert.ok(layers.every((l) => l.stop !== -1));
      assert.ok(layers.every((l) => l.peak >= 0.012));
    }
  });

  it("matches what the canvas renderer would draw", () => {
    // The two renderers must agree, or a design tuned on the web would not
    // survive the trip to a phone.
    const baked = bakeCycle(facets, options, 3, { steps: 64, epsilon: 0 });
    const sample = createSample(3);
    const entry = baked.facets[7];
    const step = 13;
    sampleFacet(
      entry.facet,
      cycleDuration(options) * (step / 64),
      options,
      3,
      sample,
    );
    for (const layer of entry.layers) {
      if (layer.stop < 0) continue;
      assert.ok(Math.abs(layer.values[step] - sample.weights[layer.stop]) < 1e-9);
    }
  });

  it("reports the cycle duration the driver should loop over", () => {
    const baked = bakeCycle(facets, options, 3, { steps: 16 });
    assert.ok(Math.abs(baked.duration - 1 / options.speed) < 1e-9);
  });
});

describe("presets", () => {
  it("all resolve to usable options and palettes", () => {
    for (const [name, preset] of Object.entries(presets)) {
      assert.ok(preset.colors.length >= 2, `${name} needs a palette`);
      const opts = resolveOptions(preset.options);
      const facets = buildFacets(rim(), opts);
      const sample = createSample(preset.colors.length);
      let peak = 0;
      for (let step = 0; step < 24; step++) {
        for (const facet of facets) {
          const s = sampleFacet(
            facet,
            (cycleDuration(opts) * step) / 24,
            opts,
            preset.colors.length,
            sample,
          );
          if (s.total > peak) peak = s.total;
        }
      }
      assert.ok(peak > 0.1, `${name} never lights up`);
    }
  });

  it("ignores undefined overrides instead of erasing defaults", () => {
    const opts = resolveOptions({ speed: undefined, facets: 12 });
    assert.equal(opts.speed, defaultOptions.speed);
    assert.equal(opts.facets, 12);
  });
});

describe("ambient floor", () => {
  const facets = buildFacets(rim(), defaultOptions);

  it("keeps every facet lit even facing away from the light", () => {
    // Without this the far half of the rim emits nothing and the border simply
    // stops existing there.
    const sample = createSample(3);
    for (let step = 0; step < 24; step++) {
      const t = (cycleDuration(defaultOptions) * step) / 24;
      for (const facet of facets) {
        const s = sampleFacet(facet, t, defaultOptions, 3, sample);
        assert.ok(s.total > 0.1, `facet ${facet.index} went dark at t=${t}`);
      }
    }
  });

  it("leaves the far side dark when switched off", () => {
    const opts = resolveOptions({ ambient: 0 });
    const sample = createSample(3);
    const darkest = Math.min(
      ...facets.map((f) => sampleFacet(f, 2, opts, 3, sample).total),
    );
    assert.ok(darkest < 1e-6, `expected an unlit facet, dimmest was ${darkest}`);
  });

  it("still colours the rim from the palette", () => {
    // Ambient light must be tinted, not a grey wash, or the border reads dead.
    const opts = resolveOptions({ ambient: 0.3, bloom: 0, sharpness: 40 });
    const sample = createSample(3);
    const s = sampleFacet(facets[20], 4, opts, 3, sample);
    assert.ok(s.weights.some((w) => w > 0.01));
    assert.ok(Math.abs(s.weights.reduce((a, b) => a + b, 0) - s.total) < 1e-9);
  });
});
