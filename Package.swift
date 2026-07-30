// swift-tools-version: 5.9
import PackageDescription

// The Swift package lives at the repository root even though its sources sit
// under `swift/`.
//
// SwiftPM resolves a source-control dependency by looking for `Package.swift` at
// the root of the checkout and offers no way to point at a subdirectory, so a
// manifest at `swift/Package.swift` alone makes this repository impossible to
// depend on — `.package(url:)` fails resolution outright rather than degrading.
// The sources stay where they are so the three TypeScript packages keep their
// layout; only the manifest moves up.
let package = Package(
    name: "Kam",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
        .tvOS(.v15),
        .watchOS(.v8),
    ],
    products: [
        .library(name: "Kam", targets: ["Kam"]),
    ],
    targets: [
        .target(name: "Kam", path: "swift/Sources/Kam"),
        .testTarget(name: "KamTests", dependencies: ["Kam"], path: "swift/Tests/KamTests"),
    ]
)
