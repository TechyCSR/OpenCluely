import Foundation
import IOKit

// Rubic Caps Lock LED Controller
// Usage: caps_led [on|off|auto|A|B|C|D]
// Controls the built-in MacBook Caps Lock LED without affecting typing state.

@_silgen_name("IOHIDEventSystemClientCreate")
func IOHIDEventSystemClientCreate(_ allocator: CFAllocator?) -> AnyObject?

@_silgen_name("IOHIDEventSystemClientSetProperty")
func IOHIDEventSystemClientSetProperty(_ client: AnyObject, _ property: CFString, _ value: CFTypeRef) -> DarwinBoolean

let args = CommandLine.arguments
guard args.count > 1 else {
    fputs("Usage: caps_led [on|off|auto|A|B|C|D]\n", stderr)
    exit(1)
}

guard let client = IOHIDEventSystemClientCreate(nil) else {
    fputs("Error: Could not create IOHIDEventSystemClient\n", stderr)
    exit(1)
}

func setLED(_ state: String) {
    let val: CFString
    switch state.lowercased() {
    case "on":
        val = "On" as CFString
    case "off":
        val = "Off" as CFString
    default:
        val = "Auto" as CFString
    }
    _ = IOHIDEventSystemClientSetProperty(client, "HIDCapsLockLED" as CFString, val)
}

let mode = args[1].uppercased()

switch mode {
case "ON":
    setLED("on")
case "OFF":
    setLED("off")
case "AUTO":
    setLED("auto")
case "A":
    // 1 long blink (500ms)
    setLED("on")
    usleep(500_000)
    setLED("off")
    usleep(300_000)
    setLED("auto")
case "B":
    // 2 blinks (250ms each)
    for i in 0..<2 {
        setLED("on")
        usleep(250_000)
        setLED("off")
        if i < 1 { usleep(250_000) }
    }
    usleep(300_000)
    setLED("auto")
case "C":
    // 3 blinks (250ms each)
    for i in 0..<3 {
        setLED("on")
        usleep(250_000)
        setLED("off")
        if i < 2 { usleep(250_000) }
    }
    usleep(300_000)
    setLED("auto")
case "D":
    // 4 blinks (250ms each)
    for i in 0..<4 {
        setLED("on")
        usleep(250_000)
        setLED("off")
        if i < 3 { usleep(250_000) }
    }
    usleep(300_000)
    setLED("auto")
case "E":
    // 5 blinks (200ms each)
    for i in 0..<5 {
        setLED("on")
        usleep(200_000)
        setLED("off")
        if i < 4 { usleep(200_000) }
    }
    usleep(300_000)
    setLED("auto")
case "F":
    // 6 blinks (200ms each)
    for i in 0..<6 {
        setLED("on")
        usleep(200_000)
        setLED("off")
        if i < 5 { usleep(200_000) }
    }
    usleep(300_000)
    setLED("auto")
case "G":
    // 7 blinks (200ms each)
    for i in 0..<7 {
        setLED("on")
        usleep(200_000)
        setLED("off")
        if i < 6 { usleep(200_000) }
    }
    usleep(300_000)
    setLED("auto")
case "H":
    // 8 blinks (200ms each)
    for i in 0..<8 {
        setLED("on")
        usleep(200_000)
        setLED("off")
        if i < 7 { usleep(200_000) }
    }
    usleep(300_000)
    setLED("auto")
default:
    setLED("auto")
}

exit(0)


