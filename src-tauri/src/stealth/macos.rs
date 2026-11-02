//! macOS Cocoa Stealth Substrate
//! Handles NSWindowSharingNone exclusion, NSScreenSaverWindowLevel multi-desktop pinning,
//! and non-activating auxiliary window collections.

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
#[cfg(target_os = "macos")]
use cocoa::base::{id, nil, BOOL, YES, NO};
#[cfg(target_os = "macos")]
use objc::{msg_send, sel, sel_impl};

// NSWindowSharingNone = 0
pub const NS_WINDOW_SHARING_NONE: usize = 0;
// NSScreenSaverWindowLevel = 1000
pub const NS_SCREENSAVER_WINDOW_LEVEL: i32 = 1000;

/// Configures native NSWindow attributes for complete capture invisibility and multi-space floating.
#[cfg(target_os = "macos")]
pub unsafe fn apply_macos_stealth(ns_window_ptr: *mut std::ffi::c_void, click_through: bool) -> Result<(), String> {
    if ns_window_ptr.is_null() {
        return Err("Invalid NSWindow pointer (null)".to_string());
    }

    let window = ns_window_ptr as id;

    // 1. Exclude window completely from ScreenCaptureKit, Zoom, Meet, and AirPlay
    let () = msg_send![window, setSharingType: NS_WINDOW_SHARING_NONE];

    // 2. Float above fullscreen spaces without docking or window cycle inclusion
    let () = msg_send![window, setLevel: NS_SCREENSAVER_WINDOW_LEVEL];

    let collection_behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary
        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle;
    window.setCollectionBehavior_(collection_behavior);

    // 3. Set mouse event pass-through
    let ignores: BOOL = if click_through { YES } else { NO };
    window.setIgnoresMouseEvents_(ignores);

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn apply_macos_stealth(_ns_window_ptr: *mut std::ffi::c_void, _click_through: bool) -> Result<(), String> {
    Ok(())
}
