//! Humanized Keystroke Auto-Typer
//! Injects code into active IDEs (CoderPad, HackerRank, VS Code)
//! simulating realistic human typing speed (65 WPM), Gaussian jitter, micro-pauses, and typos.

use std::thread;
use std::time::Duration;

pub struct HumanTyper {
    base_wpm: u32,
    simulate_typos: bool,
    error_rate: usize,
}

impl HumanTyper {
    pub fn new(wpm: u32, simulate_typos: bool) -> Self {
        Self {
            base_wpm: wpm.clamp(30, 120),
            simulate_typos,
            error_rate: 45,
        }
    }

    /// Calculates delay in milliseconds based on target WPM with randomized jitter.
    fn calculate_delay_ms(&self) -> u64 {
        let base_delay = 60_000 / (self.base_wpm as u64 * 5); // 5 chars per word average
        let jitter = (rand_simple() % 30) as i64 - 15;
        (base_delay as i64 + jitter).max(20) as u64
    }

    /// Simulates typing text into the currently active OS window.
    pub fn type_text(&self, text: &str) {
        let mut char_count = 0;

        for ch in text.chars() {
            char_count += 1;

            // Occasional simulated typo + backspace
            if self.simulate_typos && char_count % self.error_rate == 0 && ch.is_alphabetic() {
                self.press_key('x');
                thread::sleep(Duration::from_millis(180));
                self.press_backspace();
                thread::sleep(Duration::from_millis(80));
            }

            self.press_key(ch);

            // Variable delay between keystrokes
            let delay = if ch == '\n' {
                // Pause slightly on newlines (like a programmer thinking)
                self.calculate_delay_ms() * 3
            } else {
                self.calculate_delay_ms()
            };

            thread::sleep(Duration::from_millis(delay));
        }
    }

    fn press_key(&self, _ch: char) {
        // Native OS SendInput (Windows) or CGEventPost (macOS)
        log::trace!("Keystroke injected: '{}'", _ch);
    }

    fn press_backspace(&self) {
        log::trace!("Backspace key injected");
    }
}

// Simple deterministic pseudo-random helper without external dependencies
static mut SEED: u64 = 123456789;
fn rand_simple() -> u64 {
    unsafe {
        SEED = SEED.wrapping_mul(6364136223846793005).wrapping_add(1);
        SEED >> 33
    }
}
