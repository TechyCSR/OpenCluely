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

    if let Some(main_win) = app.get_webview_window("main") {
        if visible {
            let _ = main_win.show();
        } else {
            let _ = main_win.hide();
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
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = stealth::harden_window(platform, 0, s.transparent_mode, click_through);
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
    });
    Ok(())
}

#[tauri::command]
fn get_app_state(state: State<'_, SharedState>) -> AppState {
    state.0.read().clone()
}

#[tauri::command]
fn auto_type(text: String) -> Result<(), String> {
    let typer = autotyper::HumanTyper::new(65, false);
    typer.type_text(&text);
    Ok(())
}

#[tauri::command]
fn get_profile() -> ai::CandidateProfile {
    let cm = ai::ContextManager::new();
    cm.load_profile()
}

#[tauri::command]
fn save_profile(profile: ai::CandidateProfile) -> Result<(), String> {
    let cm = ai::ContextManager::new();
    cm.save_profile(&profile)
}

#[tauri::command]
async fn send_prompt(prompt: String, skill: String, language: String) -> Result<String, String> {
    let skill_type = ai::SkillType::from_str(&skill);
    let cm = ai::ContextManager::new();
    let grounding = cm.build_grounding_context();
    let sys_prompt = skill_type.get_system_prompt(&language, Some(&grounding));

    let api_key = std::env::var("GEMINI_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        return Ok(format!(
            "**[Native Prompt Engine]**\nLanguage: `{language}` | Skill: `{skill}`\n\nPrompt: {prompt}\n\n*Configure GEMINI_API_KEY in your environment to query live AI model.*"
        ));
    }

    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    );

    let body = serde_json::json!({
        "contents": [{
            "parts": [{
                "text": format!("{sys_prompt}\n\nUSER REQUEST / INTERVIEW QUESTION:\n{prompt}")
            }]
        }]
    });

    let resp = client.post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("AI Provider Error: {err_text}"));
    }

    let json_resp: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let raw_text = json_resp["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("No response content")
        .to_string();

    let mut sanitizer = ai::StreamSanitizer::new();
    let clean = sanitizer.process_chunk(&raw_text).unwrap_or(raw_text);
    Ok(clean)
}

#[tauri::command]
fn capture_screen() -> Result<String, String> {
    let grabber = vision::ScreenGrabber::new();
    let frame = grabber.capture_area(vision::CaptureArea::FullScreen)?;
    let ocr = vision::FastOcr::new();
    let text = ocr.extract_text(&frame)?;
    Ok(format!("**Captured Screen Content:**\n```\n{text}\n```"))
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
            get_app_state,
            auto_type,
            get_profile,
            save_profile,
            send_prompt,
            capture_screen
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
                #[cfg(not(any(windows, target_os = "macos")))]
                {
                    let _ = stealth::harden_window(platform, 0, false, false);
                }
            }

            log::info!("OpenCluely v2 window hardening complete on {}", platform);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenCluely v2");
}
