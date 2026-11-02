//! Local Candidate Context & Resume Grounding
//! Ingests resume and job description to provide authentic, personalized answers.
//! All data is stored strictly locally on the user's device.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CandidateProfile {
    pub name: String,
    pub years_experience: u32,
    pub primary_languages: Vec<String>,
    pub past_companies: Vec<String>,
    pub key_projects: Vec<String>,
    pub resume_text: String,
    pub target_job_description: String,
}

pub struct ContextManager {
    profile_path: PathBuf,
}

impl ContextManager {
    pub fn new() -> Self {
        let mut path = dirs_next().unwrap_or_else(|| PathBuf::from("."));
        path.push(".opencluely");
        let _ = fs::create_dir_all(&path);
        path.push("profile.json");
        Self { profile_path: path }
    }

    pub fn load_profile(&self) -> CandidateProfile {
        if let Ok(data) = fs::read_to_string(&self.profile_path) {
            if let Ok(profile) = serde_json::from_str(&data) {
                return profile;
            }
        }
        CandidateProfile::default()
    }

    pub fn save_profile(&self, profile: &CandidateProfile) -> Result<(), String> {
        let json = serde_json::to_string_pretty(profile).map_err(|e| e.to_string())?;
        fs::write(&self.profile_path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn build_grounding_context(&self) -> String {
        let p = self.load_profile();
        if p.resume_text.is_empty() && p.key_projects.is_empty() {
            return String::new();
        }

        format!(
            "CANDIDATE BACKGROUND:\n- Experience: {} years\n- Core Tech: {}\n- Past Companies: {}\n- Projects Summary: {}\n- Target Role: {}",
            p.years_experience,
            p.primary_languages.join(", "),
            p.past_companies.join(", "),
            p.key_projects.join("; "),
            p.target_job_description
        )
    }
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}
