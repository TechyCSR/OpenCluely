import Foundation
import CoreGraphics
import ApplicationServices

// Ensure stdout is unbuffered so JSON lines stream immediately
setbuf(stdout, nil)

var isCancelled = false

signal(SIGINT) { _ in
    isCancelled = true
}
signal(SIGTERM) { _ in
    isCancelled = true
}

// ── Keyboard Adjacency for Organic Mistakes ──
let keyboardAdjacent: [Character: String] = [
    "q": "wa", "w": "qes", "e": "wrd", "r": "etf", "t": "ryg",
    "y": "tuh", "u": "yij", "i": "uok", "o": "ipl", "p": "ol",
    "a": "qwsz", "s": "awedxz", "d": "serfcx", "f": "drtgvc", "g": "ftyhbv",
    "h": "gyujnb", "j": "huikmn", "k": "jiolm", "l": "kop",
    "z": "asx", "x": "zsdc", "c": "xdfv", "v": "cfgb", "b": "vghn",
    "n": "bhjm", "m": "njk"
]

func getTypoChar(_ char: Character) -> Character? {
    let lower = Character(char.lowercased())
    if let adj = keyboardAdjacent[lower], !adj.isEmpty {
        let randChar = adj.randomElement()!
        return char.isUppercase ? Character(randChar.uppercased()) : randChar
    }
    return nil
}

// ── Native CoreGraphics Driver ──
let eventSource = CGEventSource(stateID: .hidSystemState)

func postEvent(_ ev: CGEvent) {
    ev.post(tap: .cghidEventTap)
}

func typeChar(_ char: Character) {
    if char == "\r" { return }
    if char == "\n" {
        // Return key code 36
        if let evDown = CGEvent(keyboardEventSource: eventSource, virtualKey: 36, keyDown: true) {
            evDown.flags = []
            postEvent(evDown)
        }
        usleep(20_000) // 20ms
        if let evUp = CGEvent(keyboardEventSource: eventSource, virtualKey: 36, keyDown: false) {
            evUp.flags = []
            postEvent(evUp)
        }
        usleep(30_000) // 30ms
        return
    }
    if char == "\t" {
        // Tab key code 48
        if let evDown = CGEvent(keyboardEventSource: eventSource, virtualKey: 48, keyDown: true) {
            evDown.flags = []
            postEvent(evDown)
        }
        usleep(20_000)
        if let evUp = CGEvent(keyboardEventSource: eventSource, virtualKey: 48, keyDown: false) {
            evUp.flags = []
            postEvent(evUp)
        }
        usleep(25_000)
        return
    }

    var utf16Units = Array(String(char).utf16)
    if let evDown = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: true) {
        evDown.flags = []
        evDown.keyboardSetUnicodeString(stringLength: utf16Units.count, unicodeString: &utf16Units)
        postEvent(evDown)
    }
    usleep(12_000)
    if let evUp = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: false) {
        evUp.flags = []
        evUp.keyboardSetUnicodeString(stringLength: utf16Units.count, unicodeString: &utf16Units)
        postEvent(evUp)
    }
    usleep(6_000)
}

func pressBackspace(_ count: Int = 1) {
    for _ in 0..<count {
        if let evDown = CGEvent(keyboardEventSource: eventSource, virtualKey: 51, keyDown: true) {
            evDown.flags = []
            postEvent(evDown)
        }
        usleep(25_000)
        if let evUp = CGEvent(keyboardEventSource: eventSource, virtualKey: 51, keyDown: false) {
            evUp.flags = []
            postEvent(evUp)
        }
        usleep(35_000)
    }
}

// ── Timing & Delays ──
func calculateDelay(char: Character, prevChar: Character, minWpm: Double, maxWpm: Double) -> (Double, Double) {
    let currentWpm = Double.random(in: minWpm...maxWpm)
    let baseDelay = 60.0 / (currentWpm * 5.0)
    let jitter = Double.random(in: -0.012...0.018)
    var delay = max(0.045, baseDelay + jitter)

    if ".!?;:".contains(char) {
        delay += Double.random(in: 0.08...0.16)
    } else if "\n\r".contains(char) {
        delay += Double.random(in: 0.14...0.22)
    } else if " \t".contains(char) {
        delay += Double.random(in: 0.02...0.04)
    } else if "(){}[]<>=+-*/\"'#@$%^&_~`".contains(char) {
        delay += Double.random(in: 0.03...0.06)
    } else if char.isUppercase {
        delay += Double.random(in: 0.015...0.035)
    }

    return (delay, currentWpm)
}

func formatEta(_ seconds: Int) -> String {
    if seconds < 60 {
        return "\(seconds)s"
    }
    let mins = seconds / 60
    let rem = seconds % 60
    return String(format: "%dm %02ds", mins, rem)
}

func getLeadingIndent(_ line: String) -> Int {
    var count = 0
    for char in line {
        if char == " " { count += 1 }
        else if char == "\t" { count += 4 }
        else { break }
    }
    return count
}

enum TypingAction {
    case char(Character)
    case unindent(Int)
    case newline
}

// ── Main Execution ──
func main() {
    let inputData = FileHandle.standardInput.readDataToEndOfFile()
    var text = ""
    var minWpm = 90.0
    var maxWpm = 120.0
    var startDelay = 0.25

    if let json = try? JSONSerialization.jsonObject(with: inputData, options: []) as? [String: Any] {
        text = json["text"] as? String ?? ""
        if let val = json["min_wpm"] as? Double { minWpm = val }
        if let val = json["max_wpm"] as? Double { maxWpm = val }
        if let val = json["start_delay"] as? Double { startDelay = val }
    } else if let str = String(data: inputData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !str.isEmpty {
        text = str
    }

    if text.isEmpty {
        print("{\"event\":\"empty\"}")
        return
    }

    if startDelay > 0 {
        Thread.sleep(forTimeInterval: startDelay)
    }

    let totalChars = text.count
    let startTime = Date()
    let avgWpm = (minWpm + maxWpm) / 2.0
    let initialEtaSec = max(1, Int(ceil((Double(totalChars) / 5.0) / (avgWpm / 60.0))))

    print("{\"event\":\"start\",\"total\":\(totalChars),\"eta_seconds\":\(initialEtaSec),\"eta_text\":\"\(formatEta(initialEtaSec))\"}")

    // Smart Indentation Planning
    let lines = text.components(separatedBy: "\n")
    let isMultilineCode = lines.count > 1 && lines.contains(where: { getLeadingIndent($0) > 0 })
    var typingActions: [TypingAction] = []
    var currentEditorIndent = 0

    if isMultilineCode {
        for (i, line) in lines.enumerated() {
            if i == 0 {
                for c in line { typingActions.append(.char(c)) }
                currentEditorIndent = getLeadingIndent(line)
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.hasSuffix(":") || trimmed.hasSuffix("{") || trimmed.hasSuffix("(") || trimmed.hasSuffix("[") {
                    currentEditorIndent += 4
                }
            } else {
                typingActions.append(.newline)
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.isEmpty { continue }

                let targetIndent = getLeadingIndent(line)
                if targetIndent == currentEditorIndent {
                    let content = line.trimmingPrefix(while: { $0 == " " || $0 == "\t" })
                    for c in content { typingActions.append(.char(c)) }
                } else if targetIndent > currentEditorIndent {
                    let delta = targetIndent - currentEditorIndent
                    let content = String(repeating: " ", count: delta) + line.trimmingPrefix(while: { $0 == " " || $0 == "\t" })
                    for c in content { typingActions.append(.char(c)) }
                    currentEditorIndent = targetIndent
                } else {
                    let unindent = currentEditorIndent - targetIndent
                    let bsCount = max(1, (unindent + 3) / 4)
                    typingActions.append(.unindent(bsCount))
                    let content = line.trimmingPrefix(while: { $0 == " " || $0 == "\t" })
                    for c in content { typingActions.append(.char(c)) }
                    currentEditorIndent = targetIndent
                }

                if trimmed.hasSuffix(":") || trimmed.hasSuffix("{") || trimmed.hasSuffix("(") || trimmed.hasSuffix("[") {
                    currentEditorIndent = targetIndent + 4
                } else {
                    currentEditorIndent = targetIndent
                }
            }
        }
    } else {
        for c in text {
            if c == "\n" { typingActions.append(.newline) }
            else { typingActions.append(.char(c)) }
        }
    }

    let totalActions = typingActions.count
    var prevChar: Character = " "
    var actionIndex = 0

    for action in typingActions {
        if isCancelled {
            print("{\"event\":\"stopped\",\"index\":\(actionIndex),\"total\":\(totalActions)}")
            return
        }

        actionIndex += 1

        switch action {
        case .unindent(let count):
            pressBackspace(count)
        case .newline:
            typeChar("\n")
            Thread.sleep(forTimeInterval: Double.random(in: 0.12...0.22))
            prevChar = "\n"
        case .char(let char):
            typeChar(char)
            let (delay, currentWpm) = calculateDelay(char: char, prevChar: prevChar, minWpm: minWpm, maxWpm: maxWpm)

            let elapsed = Date().timeIntervalSince(startTime)
            let percent = Int(round((Double(actionIndex) / Double(totalActions)) * 100))
            let remaining = totalActions - actionIndex
            let cps = elapsed > 0 ? (Double(actionIndex) / elapsed) : 1.0
            let etaSeconds = max(0, Int(ceil(Double(remaining) / cps)))
            let etaText = formatEta(etaSeconds)

            if actionIndex % 3 == 0 || actionIndex == totalActions {
                let wpmFormatted = String(format: "%.1f", currentWpm)
                print("{\"event\":\"progress\",\"index\":\(actionIndex),\"total\":\(totalActions),\"percent\":\(percent),\"wpm\":\(wpmFormatted),\"eta_seconds\":\(etaSeconds),\"eta_text\":\"\(etaText)\"}")
            }

            prevChar = char
            Thread.sleep(forTimeInterval: delay)
        }
    }

    print("{\"event\":\"completed\",\"total\":\(totalActions),\"percent\":100,\"eta_seconds\":0,\"eta_text\":\"0s\"}")
}

main()
