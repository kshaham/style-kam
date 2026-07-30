# Kam

**A border is a cut edge.**

Most animated borders send a single beam travelling around the perimeter. Kam
treats the rim as the girdle of a cut gem instead: it divides the edge into
facets, gives each a deterministic micro-tilt, and rotates one light past them.
Facets catch that light *out of order* and flare individually — with a prism
fringe on either side of every flare, and a white glint on the ones cut
steepest.

One engine, three renderers:

| Package | Platform | How it draws |
| --- | --- | --- |
| [`kam-core`](packages/kam-core) | any | the maths; no rendering, no dependencies |
| [`kam-react`](packages/kam-react) | web | one `<canvas>`, four additive passes |
| [`kam-react-native`](packages/kam-react-native) | iOS / Android | native-driver opacity, no per-frame JS |
| [`Kam`](swift) | SwiftUI | a `Canvas` inside `TimelineView(.animation)` |

The facet hash is bit-for-bit identical in TypeScript and Swift, so a stone
tuned on the web reproduces exactly on a phone — same seed, same cut.

## Quick start

### React

```bash
npm install kam-react
```

```tsx
import { Facet } from "kam-react";

<div style={{ position: "relative", borderRadius: 20 }}>
  <Facet preset="diamond" />
  {children}
</div>;
```

`Facet` fills its parent, paints only the border, takes no pointer events, adds
no layout, and is `aria-hidden`. It reads the parent's computed `border-radius`
unless you pass `radius`.

The glow extends past the box, so **don't put `overflow: hidden` on an
ancestor** unless you mean to crop it.

### React Native

```bash
npm install kam-react-native
```

```tsx
import { View } from "react-native";
import { Facet } from "kam-react-native";

<View style={{ borderRadius: 20 }}>
  <Facet preset="diamond" radius={20} />
  {children}
</View>;
```

### SwiftUI

```swift
.package(url: "https://github.com/kshaham/style-kam", from: "0.1.0")
```

```swift
import Kam

CardContent()
    .padding(24)
    .background(.black)
    .facetRim(preset: .diamond, radius: 20)
```

## Presets

A palette alone isn't a look — a hard icy stone needs a different specular
exponent from a smouldering one, so each preset carries both.

| Preset | Character |
| --- | --- |
| `prism` | the default; violet through cyan with a warm flare on the way past |
| `diamond` | hard and high-contrast, only a few facets lit at any moment |
| `ember` | slow and molten, reads as heat rather than sparkle |
| `aurora` | wide and drifting, barely faceted, almost a curtain |
| `graphite` | monochrome and restrained, for interfaces that can't spare colour |

## Options

Every option means the same thing on all three platforms.

**The cut**

| Option | Default | What it does |
| --- | --- | --- |
| `facets` | `34` | segments around the rim; fewer reads as chunky crystal, more as fine glitter |
| `scatter` | `0.5` | micro-tilt per facet, in radians; at `0` the rim is smooth and the light just sweeps |
| `spread` | `0.85` | how evenly facet orientations are distributed — see below |
| `seed` | `7` | which facets are tilted which way; same seed, same stone |

**The light**

| Option | Default | What it does |
| --- | --- | --- |
| `speed` | `0.075` | light revolutions per second; `0` freezes the stone |
| `sharpness` | `11` | specular exponent; high is jewel-like, low is a soft wash |
| `bloom` | `0.22` | broad falloff under the glints |
| `ambient` | `0.24` | constant floor on every facet — see below |
| `glint` | `0.55` | white spike on the facets cut steepest; this is the sparkle |

**The colour**

| Option | Default | What it does |
| --- | --- | --- |
| `dispersion` | `0.34` | angle between chromatic samples; this is the prism fringe |
| `samples` | `3` | chromatic samples per facet; `1` turns dispersion off |
| `swirl` | `0.45` | how far a facet's position shifts its palette lookup |

**The pulse**

| Option | Default | What it does |
| --- | --- | --- |
| `breath` | `0.28` | depth of the slow whole-rim swell |
| `breathCycles` | `2` | swells per revolution; whole numbers keep the loop seamless |
| `intensity` | `1` | overall gain |

Renderer-side styling (`thickness`, `glow`, `spill`, `bleed`, `radius`) is per
platform and documented on each component.

### Two options worth understanding

**`ambient`** — a facet only catches the light across half a turn. Without a
floor, the far side of the rim emits nothing and the border simply stops
existing there. Ambient keeps the whole edge drawn and tinted, drifting in hue
with the light, so the flares read as highlights *on* a border rather than *as*
the border. Set it to `0` for a stark single-arc look.

**`spread`** — a rounded rectangle hides almost all of its normal-angle
variation in the four corner arcs; every facet along a straight edge shares one
normal. Lit by those true normals (`spread: 0`), a whole edge flares at once and
the diagonals between edges go dark, and how bad that looks depends entirely on
the box's aspect ratio. At `spread: 1` orientations are distributed evenly by
rim position instead, and a wide banner and a tall tile shimmer alike. The
flicker that remains is `scatter` doing its job.

## Accessibility

The rim is decorative and marked as such: hidden from assistive technology, no
pointer events, no layout impact. Under `prefers-reduced-motion` (and
`AccessibilityInfo.isReduceMotionEnabled` / `accessibilityReduceMotion`) it
settles onto a single lit frame rather than vanishing, so the border still
reads. On the web, `reducedMotion="hide"` opts out entirely.

## Performance

- **Web** — the blurred passes are drawn to an offscreen layer and blurred once
  on composite. Setting `ctx.filter` and stroking each facet separately means
  one blur per facet, which is around a hundred per frame per element and far
  too slow to animate.
- **React Native** — a whole cycle is baked up front into per-layer opacity
  curves and replayed off one looping `Animated.Value` with `useNativeDriver`.
  There is no per-frame JS, so a busy JS thread doesn't touch the animation.
  This works because the palette blend only ever lights two adjacent stops at
  once, so summing solid-colour layers reproduces the mixed colour the canvas
  renderer computes directly.
- **SwiftUI** — one `Canvas`, one draw pass, no per-facet views to diff.

## Development

```bash
npm install
npm run build      # all three TypeScript packages
npm test           # engine tests
npm run dev        # the demo site
```

Swift:

```bash
cd swift && swift test
```

## Demo

`examples/web` is a Vite site with the preset gallery, a live playground for
every option, and code output for all three platforms.

## Licence

MIT.
