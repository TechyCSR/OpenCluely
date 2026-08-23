import Foundation
import Vision
import Cocoa

guard CommandLine.arguments.count == 5,
      let x = Double(CommandLine.arguments[1]),
      let y = Double(CommandLine.arguments[2]),
      let w = Double(CommandLine.arguments[3]),
      let h = Double(CommandLine.arguments[4]) else {
    print("Usage: vision_extract <x> <y> <width> <height>")
    exit(1)
}

let tempFilePath = "/tmp/cluely_vision_capture_\(UUID().uuidString).png"

let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
// -x prevents the capture sound
process.arguments = ["-x", "-R", "\(x),\(y),\(w),\(h)", tempFilePath]
do {
    try process.run()
    process.waitUntilExit()
} catch {
    print("Error: Failed to capture screen.")
    exit(1)
}

defer {
    try? FileManager.default.removeItem(atPath: tempFilePath)
}

guard let image = NSImage(contentsOfFile: tempFilePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Error: Could not load captured image.")
    exit(1)
}

let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
let request = VNRecognizeTextRequest { (request, error) in
    if let error = error {
        print("Error: \(error.localizedDescription)")
        exit(1)
    }
    guard let observations = request.results as? [VNRecognizedTextObservation] else { exit(0) }
    let extractedText = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    print(extractedText)
}

request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

do {
    try requestHandler.perform([request])
} catch {
    print("Error: \(error)")
    exit(1)
}
