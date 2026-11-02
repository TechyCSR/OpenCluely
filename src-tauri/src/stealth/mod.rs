pub mod win32;
pub mod macos;
pub mod linux;
pub mod panic;

pub use panic::PanicManager;

/// Platform-agnostic window hardening entry point
pub fn harden_window(
    platform: &str,
    window_handle: isize,
    transparent_mode: bool,
    click_through: bool,
) -> Result<(), String> {
    match platform {
        "windows" => {
            #[cfg(windows)]
            unsafe {
                win32::apply_win32_stealth(window_handle, transparent_mode, click_through)?;
            }
            #[cfg(not(windows))]
            win32::apply_win32_stealth(window_handle, transparent_mode, click_through)?;
        }
        "macos" => {
            #[cfg(target_os = "macos")]
            unsafe {
                macos::apply_macos_stealth(window_handle as *mut std::ffi::c_void, click_through)?;
            }
            #[cfg(not(target_os = "macos"))]
            macos::apply_macos_stealth(window_handle as *mut std::ffi::c_void, click_through)?;
        }
        _ => {
            linux::apply_linux_stealth(window_handle, click_through)?;
        }
    }
    Ok(())
}
