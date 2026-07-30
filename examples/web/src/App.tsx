import { useMemo, useState } from "react";
import {
  type FacetOptions,
  type PresetName,
  defaultOptions,
  presets,
  resolveOptions,
} from "kam-core";
import { Facet } from "kam-react";
import { controlGroups, formatValue } from "./controls";
import { nativeSnippet, reactSnippet, swiftSnippet } from "./snippets";

const PRESET_NOTES: Record<PresetName, string> = {
  prism: "The default. Violet through cyan with a warm flare on the way past.",
  diamond: "Hard and high-contrast. Only a few facets are lit at any moment.",
  ember: "Slow and molten. Reads as heat rather than sparkle.",
  aurora: "Wide and drifting. Barely faceted, almost a curtain.",
  graphite: "Monochrome and restrained, for interfaces that can't spare colour.",
};

const PRESET_NAMES = Object.keys(presets) as PresetName[];

type Tab = "react" | "native" | "swift";

export function App() {
  const [preset, setPreset] = useState<PresetName>("prism");
  const [overrides, setOverrides] = useState<Partial<FacetOptions>>({});
  const [tab, setTab] = useState<Tab>("react");

  const colors = presets[preset].colors;
  const options = useMemo(
    () => resolveOptions({ ...presets[preset].options, ...overrides }),
    [preset, overrides],
  );

  const snippet =
    tab === "react"
      ? reactSnippet(options, colors)
      : tab === "native"
        ? nativeSnippet(options, colors)
        : swiftSnippet(options, colors);

  const choosePreset = (name: PresetName) => {
    setPreset(name);
    // Presets are a starting point, not a filter over the user's edits.
    setOverrides({});
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-grid">
          <div>
            <p className="eyebrow">Kam</p>
            <h1>
              A border is
              <br />
              a cut edge.
            </h1>
            <p className="lede">
              Most animated borders send one beam around the perimeter. Kam treats
              the rim as the girdle of a cut gem instead: it divides the edge into
              facets, gives each a micro-tilt, and rotates a single light past
              them. Facets catch it out of order and flare individually, with a
              prism fringe on either side of every flare.
            </p>
            <p className="lede" style={{ marginTop: "1rem" }}>
              One engine, three renderers — canvas on the web, native-driver
              opacity on React Native, and a SwiftUI <code>Canvas</code>.
            </p>
          </div>

          <div className="surface hero-stage">
            <Facet
              preset={preset}
              radius={26}
              thickness={1.6}
              glow={11}
              spill={0.7}
            />
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>
                live
              </p>
              <h2 style={{ marginTop: "0.4rem" }}>{preset}</h2>
              <p style={{ fontSize: "0.92rem" }}>{PRESET_NOTES[preset]}</p>
            </div>
            <dl className="stage-readout">
              <div className="readout">
                <dt>facets</dt>
                <dd>{options.facets}</dd>
              </div>
              <div className="readout">
                <dt>cycle</dt>
                <dd>{options.speed > 0 ? `${(1 / options.speed).toFixed(0)}s` : "—"}</dd>
              </div>
              <div className="readout">
                <dt>samples</dt>
                <dd>{options.samples}</dd>
              </div>
            </dl>
          </div>
        </div>
      </header>

      <section aria-labelledby="presets-heading">
        <div className="section-head">
          <h2 id="presets-heading">Five stones</h2>
          <p>
            A palette alone isn't a look — a hard icy stone needs a different
            specular exponent from a smouldering one. Each preset carries both.
            Pick one to load it into the playground.
          </p>
        </div>

        <div className="gallery">
          {PRESET_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              className="surface tile"
              aria-pressed={name === preset}
              onClick={() => choosePreset(name)}
            >
              <Facet preset={name} radius={18} thickness={1.3} glow={8} spill={0.5} />
              <div className="swatches" aria-hidden="true">
                {presets[name].colors.map((c) => (
                  <span key={c} className="swatch" style={{ background: c, color: c }} />
                ))}
              </div>
              <span className="tile-name">{name}</span>
              <span className="tile-note">{PRESET_NOTES[name]}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="playground-heading">
        <div className="section-head">
          <h2 id="playground-heading">Cut your own</h2>
          <p>
            Every parameter below is the same on all three platforms, down to the
            seed — the facet hash is bit-for-bit identical in TypeScript and
            Swift, so a stone tuned here reproduces exactly on a phone.
          </p>
        </div>

        <div className="playground">
          <div className="canvas-well">
            <div className="specimen" style={{ position: "relative" }}>
              <Facet
                colors={colors}
                radius={22}
                thickness={1.6}
                glow={11}
                spill={0.7}
                {...presetOptionsFor(preset, overrides)}
              />
              <h3 style={{ fontSize: "1.15rem" }}>Deploy to production</h3>
              <p style={{ fontSize: "0.92rem" }}>
                Everything is green. 42 checks passed in 3m 18s.
              </p>
              <div className="specimen-shapes">
                <div className="pill">
                  <Facet
                    colors={colors}
                    radius={999}
                    thickness={1.2}
                    glow={7}
                    spill={0.4}
                    {...presetOptionsFor(preset, overrides)}
                  />
                  Ship it
                </div>
                <div className="chip">
                  <Facet
                    colors={colors}
                    radius={14}
                    thickness={1.2}
                    glow={7}
                    spill={0.4}
                    {...presetOptionsFor(preset, overrides)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="controls">
            {controlGroups.map((group) => (
              <div className="control-group" key={group.title}>
                <h3>{group.title}</h3>
                <p>{group.blurb}</p>
                {group.controls.map((def) => (
                  <label className="control" key={def.key}>
                    <span className="control-row">
                      <span className="control-name">{def.label}</span>
                      <span className="control-value">
                        {formatValue(def, options[def.key])}
                      </span>
                    </span>
                    <input
                      type="range"
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      value={options[def.key]}
                      onChange={(event) =>
                        setOverrides((prev) => ({
                          ...prev,
                          [def.key]: Number(event.target.value),
                        }))
                      }
                    />
                    <span className="control-hint">{def.hint}</span>
                  </label>
                ))}
              </div>
            ))}

            <button
              type="button"
              className="reset"
              onClick={() => setOverrides({})}
              disabled={Object.keys(overrides).length === 0}
            >
              Reset to the {preset} cut
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="code-heading">
        <div className="section-head">
          <h2 id="code-heading">Take it with you</h2>
          <p>
            The snippet tracks the playground above, and only lists the options
            you actually moved.
          </p>
        </div>

        <div className="tabs" role="tablist" aria-label="Platform">
          {(
            [
              ["react", "React"],
              ["native", "React Native"],
              ["swift", "SwiftUI"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <pre>
          <code>{snippet}</code>
        </pre>
      </section>

      <section aria-labelledby="notes-heading">
        <div className="section-head">
          <h2 id="notes-heading">How it holds up</h2>
        </div>
        <div className="notes">
          <article className="note">
            <h3>No per-frame JS on device</h3>
            <p>
              React Native can't animate colour on the native driver, so the
              whole cycle is baked up front and replayed as per-layer opacity off
              one looping value. A busy JS thread doesn't touch the animation.
            </p>
          </article>
          <article className="note">
            <h3>Shape-independent</h3>
            <p>
              A rounded rectangle hides all its normal-angle variation in the
              corners, which would make a wide banner flare edge-by-edge and a
              square shimmer evenly. The <code>spread</code> control exists to
              take that dependency out — turn it to 0 to see what it fixes.
            </p>
          </article>
          <article className="note">
            <h3>Quiet by default</h3>
            <p>
              The rim is <code>aria-hidden</code>, never takes pointer events,
              and adds no layout. Under <code>prefers-reduced-motion</code> it
              settles onto a single lit frame rather than disappearing.
            </p>
          </article>
        </div>
      </section>

      <footer>
        <p>
          Kam — MIT. Built as an original take on the animated border, not a port
          of one.
        </p>
      </footer>
    </div>
  );
}

/**
 * The playground specimens are driven by preset options plus the user's edits.
 * `Facet` accepts a `preset` prop, but spreading the resolved values keeps the
 * pill and chip in lockstep with the sliders.
 */
function presetOptionsFor(
  preset: PresetName,
  overrides: Partial<FacetOptions>,
): Partial<FacetOptions> {
  const resolved = resolveOptions({ ...presets[preset].options, ...overrides });
  const out: Partial<FacetOptions> = {};
  for (const key of Object.keys(resolved) as (keyof FacetOptions)[]) {
    if (resolved[key] !== defaultOptions[key]) out[key] = resolved[key];
  }
  return out;
}
