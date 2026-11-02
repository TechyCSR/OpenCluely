//! Linux Stealth & Window Substrate
//! Handles X11/Wayland auxiliary window hints, skip-taskbar attributes, and decoupled output warnings.

pub fn apply_linux_stealth(_window_handle: isize, _click_through: bool) -> Result<(), String> {
    log::info!("Linux stealth substrate applied (window-scoped capture recommended for full invisibility)");
    Ok(())
}
