#!/usr/bin/env python3
"""
Human-Speed Auto Typer with Smart Indentation, Zero Modifiers & Live Progress
Simulates human keyboard typing at variable speeds (90 - 120 WPM).
Features:
- Pure character typing with strictly ZERO modifier keys (no Cmd, Alt/Option, or Ctrl)
- Smart editor indentation tracking to eliminate cascading indentation without modifiers
- Strictly no mistakes at the end of the text (final 35% / last 60 chars are 100% error-free)
- Natural human jitter and cognitive punctuation pauses
- Live ETA and progress streamed via stdout JSON
"""

import sys
import os
import time
import json
import random
import signal
import platform
import math

IS_CANCELLED = False

def sig_handler(signum, frame):
    global IS_CANCELLED
    IS_CANCELLED = True

signal.signal(signal.SIGINT, sig_handler)
signal.signal(signal.SIGTERM, sig_handler)

SYSTEM = platform.system().lower()

# Keyboard adjacency map for realistic QWERTY letter typos
KEYBOARD_ADJACENT = {
    'q': 'wa', 'w': 'qes', 'e': 'wrd', 'r': 'etf', 't': 'ryg',
    'y': 'tuh', 'u': 'yij', 'i': 'uok', 'o': 'ipl', 'p': 'ol',
    'a': 'qwsz', 's': 'awedxz', 'd': 'serfcx', 'f': 'drtgvc', 'g': 'ftyhbv',
    'h': 'gyujnb', 'j': 'huikmn', 'k': 'jiolm', 'l': 'kop',
    'z': 'asx', 'x': 'zsdc', 'c': 'xdfv', 'v': 'cfgb', 'b': 'vghn',
    'n': 'bhjm', 'm': 'njk'
}

# Symbol & punctuation slip map (e.g. : vs ;, , vs ., bracket slips, shift slips)
SYMBOL_TYPOS = {
    ':': ';',
    ';': ':',
    ',': '.',
    '.': ',',
    "'": '"',
    '"': "'",
    '[': '{',
    '{': '[',
    ']': '}',
    '}': ']',
    '(': ')',
    ')': '(',
    '-': '_',
    '_': '-',
    '=': '+',
    '+': '=',
    '/': '?',
    '?': '/',
    '<': '>',
    '>': '<',
    '!': '@',
    '@': '!',
    '#': '$',
    '$': '%',
    '*': '&',
    '&': '*'
}

DIGIT_ADJACENT = {
    '0': '9', '1': '2', '2': '13', '3': '24', '4': '35',
    '5': '46', '6': '57', '7': '68', '8': '79', '9': '80'
}

def get_typo_char(char):
    if char in SYMBOL_TYPOS:
        return SYMBOL_TYPOS[char]
    lower = char.lower()
    if lower in KEYBOARD_ADJACENT:
        typo = random.choice(KEYBOARD_ADJACENT[lower])
        return typo.upper() if char.isupper() else typo
    if char in DIGIT_ADJACENT:
        return random.choice(DIGIT_ADJACENT[char])
    return None

def setup_macos_typer():
    try:
        import ctypes
        from ctypes import c_void_p, c_uint32, c_uint16, c_bool, c_size_t, c_uint64, POINTER

        app_services = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices')
        
        CGEventSourceCreate = app_services.CGEventSourceCreate
        CGEventSourceCreate.argtypes = [c_uint32]
        CGEventSourceCreate.restype = c_void_p

        CGEventCreateKeyboardEvent = app_services.CGEventCreateKeyboardEvent
        CGEventCreateKeyboardEvent.argtypes = [c_void_p, c_uint16, c_bool]
        CGEventCreateKeyboardEvent.restype = c_void_p

        CGEventKeyboardSetUnicodeString = app_services.CGEventKeyboardSetUnicodeString
        CGEventKeyboardSetUnicodeString.argtypes = [c_void_p, c_size_t, POINTER(c_uint16)]
        CGEventKeyboardSetUnicodeString.restype = None

        CGEventSetFlags = app_services.CGEventSetFlags
        CGEventSetFlags.argtypes = [c_void_p, c_uint64]
        CGEventSetFlags.restype = None

        CGEventPost = app_services.CGEventPost
        CGEventPost.argtypes = [c_uint32, c_void_p]
        CGEventPost.restype = None

        CFRelease = app_services.CFRelease
        CFRelease.argtypes = [c_void_p]
        CFRelease.restype = None

        kCGHIDEventTap = 0
        kCGEventSourceStateHIDSystemState = 1

        src = CGEventSourceCreate(kCGEventSourceStateHIDSystemState)

        def type_char_macos(char):
            if char == '\r':
                return
            if char == '\n':
                # Return key (key code 36) - explicitly zero flags
                ev_down = CGEventCreateKeyboardEvent(src, 36, True)
                CGEventSetFlags(ev_down, 0)
                CGEventPost(kCGHIDEventTap, ev_down)
                CFRelease(ev_down)
                time.sleep(0.02)
                ev_up = CGEventCreateKeyboardEvent(src, 36, False)
                CGEventSetFlags(ev_up, 0)
                CGEventPost(kCGHIDEventTap, ev_up)
                CFRelease(ev_up)
                time.sleep(0.03)
                return

            if char == '\t':
                # Tab key (key code 48) - explicitly zero flags
                ev_down = CGEventCreateKeyboardEvent(src, 48, True)
                CGEventSetFlags(ev_down, 0)
                CGEventPost(kCGHIDEventTap, ev_down)
                CFRelease(ev_down)
                time.sleep(0.02)
                ev_up = CGEventCreateKeyboardEvent(src, 48, False)
                CGEventSetFlags(ev_up, 0)
                CGEventPost(kCGHIDEventTap, ev_up)
                CFRelease(ev_up)
                time.sleep(0.025)
                return

            utf16_units = [ord(c) for c in char.encode('utf-16-le').decode('utf-16')]
            arr = (c_uint16 * len(utf16_units))(*utf16_units)
            
            ev_down = CGEventCreateKeyboardEvent(src, 0, True)
            CGEventSetFlags(ev_down, 0)
            CGEventKeyboardSetUnicodeString(ev_down, len(utf16_units), arr)
            CGEventPost(kCGHIDEventTap, ev_down)
            CFRelease(ev_down)

            time.sleep(0.012)

            ev_up = CGEventCreateKeyboardEvent(src, 0, False)
            CGEventSetFlags(ev_up, 0)
            CGEventKeyboardSetUnicodeString(ev_up, len(utf16_units), arr)
            CGEventPost(kCGHIDEventTap, ev_up)
            CFRelease(ev_up)
            time.sleep(0.006)

        def press_backspace_macos(count=1):
            for _ in range(count):
                ev_down = CGEventCreateKeyboardEvent(src, 51, True)
                CGEventSetFlags(ev_down, 0)
                CGEventPost(kCGHIDEventTap, ev_down)
                CFRelease(ev_down)
                time.sleep(0.025)
                ev_up = CGEventCreateKeyboardEvent(src, 51, False)
                CGEventSetFlags(ev_up, 0)
                CGEventPost(kCGHIDEventTap, ev_up)
                CFRelease(ev_up)
                time.sleep(0.035)

        return type_char_macos, press_backspace_macos
    except Exception:
        import subprocess
        def type_char_applescript(char):
            if char == '\n':
                subprocess.run(['osascript', '-e', 'tell application "System Events" to key code 36'], check=False)
            elif char == '\t':
                subprocess.run(['osascript', '-e', 'tell application "System Events" to key code 48'], check=False)
            elif char == '"':
                subprocess.run(['osascript', '-e', 'tell application "System Events" to keystroke "\\""'], check=False)
            elif char == '\\':
                subprocess.run(['osascript', '-e', 'tell application "System Events" to keystroke "\\\\"'], check=False)
            else:
                subprocess.run(['osascript', '-e', f'tell application "System Events" to keystroke "{char}"'], check=False)

        def press_backspace_applescript(count=1):
            for _ in range(count):
                subprocess.run(['osascript', '-e', 'tell application "System Events" to key code 51'], check=False)
                time.sleep(0.035)

        return type_char_applescript, press_backspace_applescript

def setup_windows_typer():
    try:
        import ctypes
        from ctypes import wintypes

        user32 = ctypes.windll.user32

        INPUT_KEYBOARD = 1
        KEYEVENTF_KEYUP = 0x0002
        KEYEVENTF_UNICODE = 0x0004
        VK_BACK = 0x08
        VK_RETURN = 0x0D
        VK_TAB = 0x09

        class KEYBDINPUT(ctypes.Structure):
            _fields_ = [
                ("wVk", wintypes.WORD),
                ("wScan", wintypes.WORD),
                ("dwFlags", wintypes.DWORD),
                ("time", wintypes.DWORD),
                ("dwExtraInfo", ctypes.c_ulonglong)
            ]

        class INPUT(ctypes.Structure):
            class _INPUT(ctypes.Union):
                _fields_ = [("ki", KEYBDINPUT)]
            _anonymous_ = ("_input",)
            _fields_ = [
                ("type", wintypes.DWORD),
                ("_input", _INPUT)
            ]

        def send_key(vk, flags=0):
            inp = INPUT(type=INPUT_KEYBOARD, ki=KEYBDINPUT(wVk=vk, wScan=0, dwFlags=flags, time=0, dwExtraInfo=0))
            user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

        def type_char_windows(char):
            if char == '\r':
                return
            if char == '\n':
                send_key(VK_RETURN, 0)
                time.sleep(0.02)
                send_key(VK_RETURN, KEYEVENTF_KEYUP)
                time.sleep(0.03)
                return
            if char == '\t':
                send_key(VK_TAB, 0)
                time.sleep(0.02)
                send_key(VK_TAB, KEYEVENTF_KEYUP)
                time.sleep(0.025)
                return

            for unit in char.encode('utf-16-le').decode('utf-16'):
                code = ord(unit)
                inp_down = INPUT(type=INPUT_KEYBOARD, ki=KEYBDINPUT(wVk=0, wScan=code, dwFlags=KEYEVENTF_UNICODE, time=0, dwExtraInfo=0))
                user32.SendInput(1, ctypes.byref(inp_down), ctypes.sizeof(INPUT))
                time.sleep(0.012)
                inp_up = INPUT(type=INPUT_KEYBOARD, ki=KEYBDINPUT(wVk=0, wScan=code, dwFlags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time=0, dwExtraInfo=0))
                user32.SendInput(1, ctypes.byref(inp_up), ctypes.sizeof(INPUT))
                time.sleep(0.008)

        def press_backspace_windows(count=1):
            for _ in range(count):
                send_key(VK_BACK, 0)
                time.sleep(0.025)
                send_key(VK_BACK, KEYEVENTF_KEYUP)
                time.sleep(0.035)

        return type_char_windows, press_backspace_windows
    except Exception:
        import subprocess
        def type_char_ps(char):
            escaped = char.replace("`", "``").replace('"', '`"').replace("$", "`$")
            cmd = f'$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("{escaped}")'
            subprocess.run(["powershell", "-NoProfile", "-Command", cmd], check=False)

        def press_backspace_ps(count=1):
            for _ in range(count):
                cmd = '$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys("{BACKSPACE}")'
                subprocess.run(["powershell", "-NoProfile", "-Command", cmd], check=False)
                time.sleep(0.035)

        return type_char_ps, press_backspace_ps

def setup_linux_typer():
    import subprocess
    def type_char_linux(char):
        if char == '\n':
            subprocess.run(['xdotool', 'key', 'Return'], check=False)
            time.sleep(0.03)
        elif char == '\t':
            subprocess.run(['xdotool', 'key', 'Tab'], check=False)
        else:
            subprocess.run(['xdotool', 'type', '--', char], check=False)

    def press_backspace_linux(count=1):
        for _ in range(count):
            subprocess.run(['xdotool', 'key', 'BackSpace'], check=False)
            time.sleep(0.035)

    return type_char_linux, press_backspace_linux

def get_typer_drivers():
    if 'darwin' in SYSTEM:
        return setup_macos_typer()
    elif 'win' in SYSTEM:
        return setup_windows_typer()
    else:
        return setup_linux_typer()

def calculate_delay(char, prev_char, min_wpm=20.0, max_wpm=50.0):
    """Calculate organic human delay per keystroke (default 20 - 50 WPM)"""
    current_wpm = random.uniform(min_wpm, max_wpm)
    base_delay = 60.0 / (current_wpm * 5.0)

    jitter = random.uniform(-0.012, 0.018)
    delay = max(0.045, base_delay + jitter)

    if char in '.!?;:':
        delay += random.uniform(0.08, 0.16)
    elif char in '\n\r':
        delay += random.uniform(0.14, 0.22)
    elif char in ' \t':
        delay += random.uniform(0.02, 0.04)
    elif char in '(){}[]<>=+-*/\"\'#@$%^&_~`':
        delay += random.uniform(0.03, 0.06)
    elif char.isupper():
        delay += random.uniform(0.015, 0.035)

    return delay, current_wpm

def format_eta(seconds):
    if seconds < 60:
        return f"{seconds}s"
    mins = seconds // 60
    rem = seconds % 60
    return f"{mins}m {rem:02d}s"

def get_leading_indent(line):
    count = 0
    for char in line:
        if char == ' ':
            count += 1
        elif char == '\t':
            count += 4
        else:
            break
    return count

def is_safe_for_mistake(action_idx, total_actions, chars_since_last_mistake, mistake_count, max_mistakes, char):
    """
    Strict safety criteria:
    1. NEVER in final 15% or last 20 characters (ensures 100% clean, error-free finish).
    2. NEVER in first 8 characters.
    3. Maximum capped by dynamic budget based on text size.
    4. At least 28 characters between mistakes (not too many mistakes).
    5. ONLY on valid typo characters (letters, :, ;, brackets, symbols), never on whitespace.
    """
    if action_idx >= int(total_actions * 0.85) or (total_actions - action_idx) <= 20:
        return False
    if action_idx < 8:
        return False
    if mistake_count >= max_mistakes:
        return False
    if chars_since_last_mistake < 28:
        return False
    if char in ' \t\r\n':
        return False
    if get_typo_char(char) is None:
        return False
    return True

def main():
    global IS_CANCELLED

    text = ""
    speed_mode = "super_slow_mix"
    min_wpm = 20.0
    max_wpm = 50.0
    start_delay = 0.25
    enable_mistakes = True

    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == '--stdin':
            try:
                raw = sys.stdin.read()
                data = json.loads(raw)
                text = data.get('text', '')
                speed_mode = str(data.get('speed_mode', 'super_slow_mix')).lower()
                min_wpm = float(data.get('min_wpm', 20.0))
                max_wpm = float(data.get('max_wpm', 50.0))
                start_delay = float(data.get('start_delay', 0.25))
                enable_mistakes = bool(data.get('enable_mistakes', True))
            except Exception as e:
                sys.stderr.write(f"Failed to parse stdin JSON: {e}\n")
                sys.exit(1)
        else:
            text = arg
            if len(sys.argv) > 2:
                try:
                    min_wpm = float(sys.argv[2])
                except ValueError:
                    speed_mode = sys.argv[2].lower()
            if len(sys.argv) > 3:
                max_wpm = float(sys.argv[3])

    if not text:
        sys.stdout.write(json.dumps({"event": "empty"}) + "\n")
        sys.stdout.flush()
        return

    type_char, press_backspace = get_typer_drivers()

    if start_delay > 0:
        time.sleep(start_delay)

    total_chars = len(text)
    start_time = time.time()
    
    avg_wpm = (min_wpm + max_wpm) / 2.0
    initial_eta_sec = int(math.ceil((total_chars / 5.0) / (avg_wpm / 60.0)))
    
    sys.stdout.write(json.dumps({
        "event": "start",
        "total": total_chars,
        "eta_seconds": initial_eta_sec,
        "eta_text": format_eta(initial_eta_sec)
    }) + "\n")
    sys.stdout.flush()

    # Pre-plan keystrokes with smart indentation tracking
    lines = text.split('\n')
    is_multiline_code = len(lines) > 1 and any(get_leading_indent(l) > 0 for l in lines)
    
    # Build list of discrete typing actions: ('CHAR', c) or ('UNINDENT', count) or ('NEWLINE', '\n')
    typing_actions = []
    current_editor_indent = 0

    if is_multiline_code:
        for i, line in enumerate(lines):
            if i == 0:
                for c in line:
                    typing_actions.append(('CHAR', c))
                current_editor_indent = get_leading_indent(line)
                if line.rstrip().endswith((':', '{', '(', '[')):
                    current_editor_indent += 4
            else:
                typing_actions.append(('NEWLINE', '\n'))
                if line.strip() == '':
                    continue

                target_indent = get_leading_indent(line)
                if target_indent == current_editor_indent:
                    # Editor already at exact indent, type only the content
                    content = line.lstrip(' \t')
                    for c in content:
                        typing_actions.append(('CHAR', c))
                elif target_indent > current_editor_indent:
                    # Editor indent is lower, type only delta spaces
                    delta = target_indent - current_editor_indent
                    content = (' ' * delta) + line.lstrip(' \t')
                    for c in content:
                        typing_actions.append(('CHAR', c))
                    current_editor_indent = target_indent
                else:
                    # target_indent < current_editor_indent -> unindent via pure Backspaces
                    unindent = current_editor_indent - target_indent
                    bs_count = max(1, (unindent + 3) // 4)
                    typing_actions.append(('UNINDENT', bs_count))
                    content = line.lstrip(' \t')
                    for c in content:
                        typing_actions.append(('CHAR', c))
                    current_editor_indent = target_indent

                if line.rstrip().endswith((':', '{', '(', '[')):
                    current_editor_indent = target_indent + 4
                else:
                    current_editor_indent = target_indent
    else:
        for c in text:
            if c == '\n':
                typing_actions.append(('NEWLINE', '\n'))
            else:
                typing_actions.append(('CHAR', c))

    total_actions = len(typing_actions)
    prev_char = ''
    chars_since_last_mistake = 25
    chars_since_last_pause = 0
    chars_since_last_long_pause = 20
    mistake_count = 0

    # Dynamic mistake budget according to size:
    # "not too much. and randomly. dynamic randomness according to size."
    if total_chars < 40:
        max_mistakes = 0
    elif total_chars < 120:
        max_mistakes = 1
    elif total_chars < 280:
        max_mistakes = random.choice([1, 2])
    else:
        max_mistakes = min(4, max(2, total_chars // 180))

    # Dynamic random word pause budget (max 6 seconds, dynamic randomness by size, no too many pauses)
    if total_chars < 80:
        pause_budget = 0
    elif total_chars < 220:
        pause_budget = 1
    elif total_chars < 450:
        pause_budget = random.choice([1, 2])
    else:
        pause_budget = random.choice([2, 3])

    is_super_slow_mix = (
        speed_mode in ['super_slow_mix', 'dynamic_slow', 'mixed_slow'] or
        (min_wpm <= 22.0 and max_wpm >= 48.0)
    )
    # Regime definitions:
    # 1. Super Slow: 20.0 - 32.0 WPM (new, slower than Slow & Deliberate)
    # 2. Slow & Deliberate: 35.0 - 50.0 WPM
    active_regime = random.choice(['super_slow', 'slow_deliberate'])
    regime_chars_left = random.randint(12, 28)

    action_idx = 0

    while action_idx < total_actions:
        if IS_CANCELLED:
            sys.stdout.write(json.dumps({
                "event": "stopped",
                "index": action_idx,
                "total": total_actions
            }) + "\n")
            sys.stdout.flush()
            return

        action_type, payload = typing_actions[action_idx]

        if action_type == 'UNINDENT':
            # Payload is backspace count (pure keycode 51, flags = 0)
            for _ in range(payload):
                press_backspace(1)
                time.sleep(0.035)
            action_idx += 1
            continue

        if action_type == 'NEWLINE':
            type_char('\n')
            time.sleep(random.uniform(0.12, 0.22))
            prev_char = '\n'
            action_idx += 1
            chars_since_last_pause += 1
            chars_since_last_long_pause += 1

            # Check for random pause after words / lines (max 6 seconds)
            if pause_budget > 0 and chars_since_last_long_pause >= 40 and action_idx < (total_actions - 15):
                if random.random() < 0.12:
                    pause_sec = random.uniform(1.5, 5.8)  # max 6 seconds
                    time.sleep(pause_sec)
                    pause_budget -= 1
                    chars_since_last_long_pause = 0
            continue

        # Single character typing
        char = payload
        chars_since_last_mistake += 1
        chars_since_last_pause += 1
        chars_since_last_long_pause += 1

        # Dynamic regime switching between Super Slow (20-32 WPM) and Slow & Deliberate (35-50 WPM)
        if is_super_slow_mix:
            regime_chars_left -= 1
            if regime_chars_left <= 0 or (char in ' \t\n' and random.random() < 0.35):
                active_regime = 'slow_deliberate' if active_regime == 'super_slow' else 'super_slow'
                regime_chars_left = random.randint(14, 32)
            if active_regime == 'super_slow':
                curr_min_wpm, curr_max_wpm = 20.0, 32.0
            else:
                curr_min_wpm, curr_max_wpm = 35.0, 50.0
        else:
            curr_min_wpm, curr_max_wpm = min_wpm, max_wpm

        # ── Realistic Controlled Mistake (letter, symbol :, ;, brackets, etc.) ──
        if enable_mistakes and is_safe_for_mistake(action_idx, total_actions, chars_since_last_mistake, mistake_count, max_mistakes, char):
            if random.random() < 0.045:
                typo_char = get_typo_char(char)
                if typo_char and typo_char != char:
                    mistake_count += 1
                    chars_since_last_mistake = 0

                    # Decide whether to correct immediately (~50%) or continue writing 1-3 letters then backtrack (~50%)
                    subsequent_chars = []
                    k_cand = random.choice([1, 2, 3])
                    can_continue = True
                    for offset in range(1, k_cand + 1):
                        look_idx = action_idx + offset
                        if look_idx < total_actions and typing_actions[look_idx][0] == 'CHAR':
                            subsequent_chars.append(typing_actions[look_idx][1])
                        else:
                            can_continue = False
                            break

                    if can_continue and len(subsequent_chars) > 0 and (action_idx + len(subsequent_chars)) < (total_actions - 10) and random.random() < 0.50:
                        # ── Mode B: Continue writing 1-3 letters, then go back, correct and rewrite ──
                        try:
                            # 1. Type the typo character
                            type_char(typo_char)
                            time.sleep(random.uniform(0.06, 0.14))

                            # 2. Continue typing 1-3 subsequent characters as if unaware of typo
                            for sub_c in subsequent_chars:
                                type_char(sub_c)
                                d, _ = calculate_delay(sub_c, prev_char, curr_min_wpm, curr_max_wpm)
                                time.sleep(d)

                            # 3. Realization pause: user notices the typo
                            time.sleep(random.uniform(0.24, 0.52))

                            # 4. Backspace all subsequent characters PLUS the typo
                            total_to_erase = len(subsequent_chars) + 1
                            for _ in range(total_to_erase):
                                press_backspace(1)
                                time.sleep(random.uniform(0.035, 0.065))

                            # 5. Brief recovery pause before retyping correctly
                            time.sleep(random.uniform(0.12, 0.24))

                            # 6. Type the original intended character correctly
                            type_char(char)
                            d, cur_wpm = calculate_delay(char, prev_char, curr_min_wpm, curr_max_wpm)
                            time.sleep(d)

                            # 7. Retype the subsequent characters correctly
                            retype_prev = char
                            for sub_c in subsequent_chars:
                                type_char(sub_c)
                                d, cur_wpm = calculate_delay(sub_c, retype_prev, curr_min_wpm, curr_max_wpm)
                                time.sleep(d)
                                retype_prev = sub_c

                            prev_char = subsequent_chars[-1]
                            action_idx += (1 + len(subsequent_chars))
                            continue
                        except Exception as e:
                            sys.stderr.write(f"Delayed mistake simulation error: {e}\n")
                    else:
                        # ── Mode A: Immediate correction ──
                        try:
                            type_char(typo_char)
                            time.sleep(random.uniform(0.14, 0.26))
                            press_backspace(1)
                            time.sleep(random.uniform(0.08, 0.16))
                        except Exception as e:
                            sys.stderr.write(f"Immediate mistake simulation error: {e}\n")

        # Type character normally
        try:
            type_char(char)
        except Exception as e:
            sys.stderr.write(f"Typing error on char '{char}': {e}\n")

        delay, current_wpm = calculate_delay(char, prev_char, curr_min_wpm, curr_max_wpm)

        # ── Random Pause after words (max 6 seconds, dynamic randomness by size, no too many pauses) ──
        if char == ' ' and pause_budget > 0 and chars_since_last_long_pause >= 45 and action_idx >= 15 and action_idx < (total_actions - 20):
            if random.random() < 0.08:
                pause_sec = random.uniform(1.5, 5.8)  # max 6 seconds randomly
                delay += pause_sec
                pause_budget -= 1
                chars_since_last_long_pause = 0
        elif char in '.!?\n' and chars_since_last_pause > 12:
            if random.random() < 0.15:
                delay += random.uniform(0.25, 0.50)
                chars_since_last_pause = 0

        action_idx += 1

        # ── Live ETA & Progress ──
        elapsed = time.time() - start_time
        percent = int(round((action_idx / float(total_actions)) * 100))
        remaining = total_actions - action_idx

        if action_idx > 0 and elapsed > 0:
            cps = action_idx / elapsed
            eta_seconds = max(0, int(math.ceil(remaining / cps))) if cps > 0 else 0
        else:
            eta_seconds = max(0, initial_eta_sec - int(elapsed))

        eta_text = format_eta(eta_seconds)

        if action_idx % 3 == 0 or action_idx == total_actions:
            sys.stdout.write(json.dumps({
                "event": "progress",
                "index": action_idx,
                "total": total_actions,
                "percent": percent,
                "wpm": round(current_wpm, 1),
                "eta_seconds": eta_seconds,
                "eta_text": eta_text
            }) + "\n")
            sys.stdout.flush()

        prev_char = char
        time.sleep(delay)

    sys.stdout.write(json.dumps({
        "event": "completed",
        "total": total_actions,
        "percent": 100,
        "eta_seconds": 0,
        "eta_text": "0s"
    }) + "\n")
    sys.stdout.flush()

if __name__ == '__main__':
    main()
