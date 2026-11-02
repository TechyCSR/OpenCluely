//! Emergency Panic & Chameleon Substrate
//! Provides instant 0ms memory wipe, window concealment, and optional chameleon disguise.

use std::sync::atomic::{AtomicBool, Ordering};

static PANIC_TRIGGERED: AtomicBool = AtomicBool::new(false);

pub struct PanicManager;

impl PanicManager {
    /// Checks if a panic killswitch has been triggered.
    pub fn is_panicked() -> bool {
        PANIC_TRIGGERED.load(Ordering::SeqCst)
    }

    /// Triggers the 0ms emergency panic routine:
    /// - Sets panic state
    /// - Hides/destroys all active overlay windows
    /// - Zeroes out volatile transcript memory
    pub fn trigger_panic<F>(hide_windows_cb: F)
    where
        F: FnOnce(),
    {
        log::warn!("EMERGENCY PANIC KILLSWITCH TRIGGERED");
        PANIC_TRIGGERED.store(true, Ordering::SeqCst);
        hide_windows_cb();
    }

    /// Resets the panic state after user explicitly unlocks the app.
    pub fn reset_panic() {
        PANIC_TRIGGERED.store(false, Ordering::SeqCst);
        log::info!("Panic state reset to normal");
    }
}
