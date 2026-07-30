import type { FacetOptions } from "kam-core";
import { defaultOptions } from "kam-core";

/** Only emit the options the user actually moved away from the defaults. */
function changed(options: FacetOptions): Array<[string, number]> {
  return (Object.keys(options) as (keyof FacetOptions)[])
    .filter((key) => options[key] !== defaultOptions[key])
    .map((key) => [key, options[key]] as [string, number]);
}

const round = (n: number) => Number(n.toFixed(4));

export function reactSnippet(options: FacetOptions, colors: string[]): string {
  const props = changed(options)
    .map(([key, value]) => `  ${key}={${round(value)}}`)
    .join("\n");

  const palette = `  colors={[${colors.map((c) => `"${c}"`).join(", ")}]}`;
  const body = [palette, props].filter(Boolean).join("\n");

  return `import { Facet } from "kam-react";

export function Card({ children }) {
  return (
    <div style={{ position: "relative", borderRadius: 20 }}>
      <Facet
${body.replace(/^/gm, "  ")}
      />
      {children}
    </div>
  );
}`;
}

export function nativeSnippet(options: FacetOptions, colors: string[]): string {
  const props = changed(options)
    .map(([key, value]) => `      ${key}={${round(value)}}`)
    .join("\n");

  const palette = `      colors={[${colors.map((c) => `"${c}"`).join(", ")}]}`;
  const body = [palette, props].filter(Boolean).join("\n");

  return `import { View } from "react-native";
import { Facet } from "kam-react-native";

export function Card({ children }) {
  return (
    <View style={{ borderRadius: 20 }}>
      <Facet
        radius={20}
${body}
      />
      {children}
    </View>
  );
}`;
}

export function swiftSnippet(options: FacetOptions, colors: string[]): string {
  const mutations = changed(options)
    .map(([key, value]) => {
      // `facets`, `samples` and `seed` are Int on the Swift side.
      const isInt = key === "facets" || key === "samples" || key === "seed";
      return `options.${key} = ${isInt ? Math.round(value) : round(value)}`;
    })
    .join("\n        ");

  const palette = colors.map((c) => `Color(hex: "${c}")`).join(",\n            ");

  return `import Kam
import SwiftUI

struct Card: View {
    private var options: FacetOptions {
        var options = FacetOptions.default
        ${mutations || "// all defaults"}
        return options
    }

    var body: some View {
        content
            .padding(24)
            .background(.black)
            .facetRim(
                colors: [
            ${palette}
                ],
                options: options,
                radius: 20
            )
    }
}`;
}
