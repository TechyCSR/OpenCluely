import Foundation
import Cocoa
import ApplicationServices

// Check arguments: x y
guard CommandLine.arguments.count == 3,
      let x = Double(CommandLine.arguments[1]),
      let y = Double(CommandLine.arguments[2]) else {
    print("Usage: ax_extract <x> <y>")
    exit(1)
}

let point = CGPoint(x: x, y: y)

let systemWideElement = AXUIElementCreateSystemWide()

var elementAtPoint: AXUIElement?
let error = AXUIElementCopyElementAtPosition(systemWideElement, Float(point.x), Float(point.y), &elementAtPoint)

if error != .success || elementAtPoint == nil {
    print("Error: Could not find element at position. (\(error.rawValue))")
    exit(1)
}

var valueRef: CFTypeRef?
let valError = AXUIElementCopyAttributeValue(elementAtPoint!, kAXValueAttribute as CFString, &valueRef)

if valError == .success, let value = valueRef as? String {
    print(value)
} else {
    // Try title if value fails
    var titleRef: CFTypeRef?
    let titleError = AXUIElementCopyAttributeValue(elementAtPoint!, kAXTitleAttribute as CFString, &titleRef)
    if titleError == .success, let title = titleRef as? String {
        print(title)
    } else {
        print("Error: Element found, but it has no text value.")
    }
}
