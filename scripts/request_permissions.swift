import Foundation
import CoreGraphics
import AVFoundation

// Ensure standard output is unbuffered
setbuf(stdout, nil)

let bundle = Bundle.main
let bundleId = bundle.bundleIdentifier ?? "unknown"
print("Setting Permission Helper running under bundle: \(bundleId)")

// 1. Screen Capture Permission
let hasScreenAccess = CGPreflightScreenCaptureAccess()
print("Screen capture preflight status: \(hasScreenAccess)")
if !hasScreenAccess {
    print("Screen capture access not granted.")
} else {
    print("Screen capture access already granted.")
}

// 2. Microphone / Audio Recording Permission
let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
print("Microphone authorization status: \(micStatus.rawValue)")
if micStatus == .notDetermined {
    print("Requesting microphone access...")
    let semaphore = DispatchSemaphore(value: 0)
    AVCaptureDevice.requestAccess(for: .audio) { granted in
        print("Microphone access request result: \(granted)")
        semaphore.signal()
    }
    _ = semaphore.wait(timeout: .now() + 2.0)
} else {
    print("Microphone access status already determined: \(micStatus == .authorized ? "Authorized" : "Not Authorized")")
}

// 3. Accessibility Permission (Required for keyboard input injection)
let isAccessibilityTrusted = AXIsProcessTrusted()
print("Accessibility authorization status: \(isAccessibilityTrusted)")

print("Permissions check complete.")
exit(0)
