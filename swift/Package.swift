// swift-tools-version: 5.9
import PackageDescription

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
        .target(name: "Kam"),
        .testTarget(name: "KamTests", dependencies: ["Kam"]),
    ]
)
