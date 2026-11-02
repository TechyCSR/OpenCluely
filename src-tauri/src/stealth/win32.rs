//! Win32 Stealth Substrate
//! Handles DWM capture exclusion (WDA_EXCLUDEFROMCAPTURE), non-activating window flags (WS_EX_NOACTIVATE),
//! and anti-proctor class/style masquerading.

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::HWND,
    Graphics::Dwm::SetWindowDisplayAffinity,
    UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE,
        WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TRANSPARENT,
    },
};

pub const WDA_NONE: u32 = 0x00000000;
pub const WDA_MONITOR: u32 = 0x00000001;
pub const WDA_EXCLUDEFROMCAPTURE: u32 = 0x00000011; // Windows 10 2004+ and Windows 11

/// Hardens a native HWND against screen recording, window enumeration, and focus stealing.
#[cfg(windows)]
pub unsafe fn apply_win32_stealth(hwnd: isize, transparent_mode: bool, click_through: bool) -> Result<(), String> {
    let hwnd = hwnd as HWND;
    if hwnd == 0 {
        return Err("Invalid window handle (HWND is null)".to_string());
    }

    // 1. Exclude window completely from DWM screen capture (Zoom, Teams, Google Meet, OBS)
    let affinity_res = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    if affinity_res == 0 {
        // Fallback to WDA_MONITOR if on older Windows 10
        SetWindowDisplayAffinity(hwnd, WDA_MONITOR);
    }

    // 2. Fetch current extended window style
    let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;

    // WS_EX_NOACTIVATE: Window NEVER steals keyboard or activation focus on click
    ex_style |= WS_EX_NOACTIVATE;

    // WS_EX_TOOLWINDOW: Hides window from Alt+Tab and taskbar
    ex_style |= WS_EX_TOOLWINDOW;
    ex_style &= !WS_EX_APPWINDOW;

    // Anti-proctoring check: Strip WS_EX_LAYERED if transparent mode is disabled
    if transparent_mode {
        ex_style |= WS_EX_LAYERED;
    } else {
        ex_style &= !WS_EX_LAYERED;
    }

    // Click-through / ghost mode
    if click_through {
        ex_style |= WS_EX_TRANSPARENT;
    } else {
        ex_style &= !WS_EX_TRANSPARENT;
    }

    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style as isize);
    Ok(())
}

#[cfg(not(windows))]
pub fn apply_win32_stealth(_hwnd: isize, _transparent_mode: bool, _click_through: bool) -> Result<(), String> {
    Ok(())
}
