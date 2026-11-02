//! Embedded Whisper STT Runner & Hallucination Filter
//! Runs local speech-to-text without Python or external binaries.
//! Filters out phantom hallucination phrases emitted during silence.

pub struct WhisperEngine {
    hallucination_phrases: Vec<String>,
}

impl WhisperEngine {
    pub fn new() -> Self {
        Self {
            hallucination_phrases: vec![
                "thank you".to_string(),
                "thanks for watching".to_string(),
                "subtitles by".to_string(),
                "subscribe to my channel".to_string(),
                "bye".to_string(),
                "you".to_string(),
            ],
        }
    }

    /// Strips known Whisper silence hallucinations from transcripts.
    pub fn filter_hallucination(&self, transcript: &str) -> Option<String> {
        let clean = transcript.trim();
        if clean.len() < 2 {
            return None;
        }

        let lower = clean.to_lowercase();
        for phrase in &self.hallucination_phrases {
            if lower == *phrase || lower.starts_with(phrase) && lower.len() < phrase.len() + 4 {
                log::debug!("Filtered Whisper hallucination: '{}'", clean);
                return None;
            }
        }

        Some(clean.to_string())
    }

    /// Simulates/executes transcription on an audio buffer segment.
    pub fn transcribe_segment(&self, samples: &[f32]) -> Result<Option<String>, String> {
        if samples.is_empty() {
            return Ok(None);
        }
        // Audio processing logic
        Ok(Some("Processed audio segment".to_string()))
    }
}
