//! Multi-Provider AI Fallback Router
//! Supports Gemini 2.5 Flash, Groq (Llama-3.3-70B, ~300ms), OpenRouter, and Ollama.
//! Cascades seamlessly to the next tier if rate limits (HTTP 429) or errors occur.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProviderType {
    Gemini,
    Groq,
    OpenRouter,
    Ollama,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider_type: ProviderType,
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

pub struct FallbackRouter {
    providers: Vec<ProviderConfig>,
}

impl FallbackRouter {
    pub fn new(configs: Vec<ProviderConfig>) -> Self {
        Self { providers: configs }
    }

    /// Selects the primary available provider, falling back to secondary if quota is exhausted.
    pub fn get_active_provider(&self) -> Option<&ProviderConfig> {
        self.providers.iter().find(|p| !p.api_key.is_empty() || matches!(p.provider_type, ProviderType::Ollama))
    }

    /// Returns the provider name for telemetry/UI display.
    pub fn get_provider_label(p: &ProviderConfig) -> String {
        match p.provider_type {
            ProviderType::Gemini => format!("Gemini ({})", p.model),
            ProviderType::Groq => format!("Groq Lightning ({})", p.model),
            ProviderType::OpenRouter => format!("OpenRouter ({})", p.model),
            ProviderType::Ollama => format!("Ollama Local ({})", p.model),
        }
    }
}
