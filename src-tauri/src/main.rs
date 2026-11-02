#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod stealth;
mod audio;
mod vision;
mod ai;
mod autotyper;
mod auth;

use tauri::{AppHandle, Manager, State};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppState {
    pub is_interactive: bool,
    pub is_visible: bool,
    pub active_skill: String,
    pub coding_language: String,
    pub transparent_mode: bool,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            is_interactive: true,
            is_visible: true,
            active_skill: "dsa".to_string(),
            coding_language: "cpp".to_string(),
            transparent_mode: false,
        }
    }
}

pub struct SharedState(pub RwLock<AppState>);

#[tauri::command]
fn toggle_visibility(app: AppHandle, state: State<'_, SharedState>) -> Result<bool, String> {
    let mut s = state.0.write();
    s.is_visible = !s.is_visible;
    let visible = s.is_visible;

    // Fix for Issue #71: Synchronously hide or show ALL windows in the tree
    if let Some(main_win) = app.get_webview_window("main") {
        if visible {
            let _ = main_win.show();
        } else {
            let _ = main_win.hide();
        }
    }
    if let Some(resp_win) = app.get_webview_window("response") {
        if visible {
            // Keep response visibility matching its own content state or show
        } else {
            let _ = resp_win.hide();
        }
    }

    Ok(visible)
}

#[tauri::command]
fn toggle_clickthrough(app: AppHandle, state: State<'_, SharedState>) -> Result<bool, String> {
    let mut s = state.0.write();
    s.is_interactive = !s.is_interactive;
    let interactive = s.is_interactive;
    let click_through = !interactive;

    let platform = if cfg!(windows) {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };

    if let Some(main_win) = app.get_webview_window("main") {
        #[cfg(windows)]
        if let Ok(hwnd) = main_win.hwnd() {
            let _ = stealth::harden_window(platform, hwnd.0 as isize, s.transparent_mode, click_through);
        }
        #[cfg(target_os = "macos")]
        if let Ok(ns_win) = main_win.ns_window() {
            let _ = stealth::harden_window(platform, ns_win as isize, s.transparent_mode, click_through);
        }
    }

    Ok(interactive)
}

#[tauri::command]
fn trigger_panic(app: AppHandle) -> Result<(), String> {
    stealth::PanicManager::trigger_panic(|| {
        if let Some(main_win) = app.get_webview_window("main") {
            let _ = main_win.hide();
        }
        if let Some(resp_win) = app.get_webview_window("response") {
            let _ = resp_win.hide();
        }
    });
    Ok(())
}

#[tauri::command]
fn get_app_state(state: State<'_, SharedState>) -> AppState {
    state.0.read().clone()
}

fn main() {
    env_logger::init();
    log::info!("Starting OpenCluely v2 Native Core...");

    tauri::Builder::default()
        .manage(SharedState(RwLock::new(AppState::default())))
        .invoke_handler(tauri::generate_handler![
            toggle_visibility,
            toggle_clickthrough,
            trigger_panic,
            get_app_state
        ])
        .setup(|app| {
            let platform = if cfg!(windows) {
                "windows"
            } else if cfg!(target_os = "macos") {
                "macos"
            } else {
                "linux"
            };

            // Harden main window immediately on creation
            if let Some(main_win) = app.get_webview_window("main") {
                #[cfg(windows)]
                if let Ok(hwnd) = main_win.hwnd() {
                    let _ = stealth::harden_window(platform, hwnd.0 as isize, false, false);
                }
                #[cfg(target_os = "macos")]
                if let Ok(ns_win) = main_win.ns_window() {
                    let _ = stealth::harden_window(platform, ns_win as isize, false, false);
                }
            }

            log::info!("OpenCluely v2 window hardening complete on {}", platform);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenCluely v2");
}
