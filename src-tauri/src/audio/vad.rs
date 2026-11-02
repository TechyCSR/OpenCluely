//! Conversational Turn Detector & Acoustic Voice Activity Detection (VAD)
//! Tracks active speech frames and enforces a dynamic silence barrier (2,400ms)
//! so interviewer mid-sentence pauses are joined into a single coherent question.

use std::time::{Duration, Instant};

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum SpeechState {
    Silence,
    Speaking,
    WaitingForTurnCompletion,
    TurnCompleted,
}

pub struct TurnDetector {
    silence_threshold: Duration,
    last_speech_time: Option<Instant>,
    current_state: SpeechState,
    energy_threshold: f32,
}

impl TurnDetector {
    pub fn new(silence_threshold_ms: u64, energy_threshold: f32) -> Self {
        Self {
            silence_threshold: Duration::from_millis(silence_threshold_ms),
            last_speech_time: None,
            current_state: SpeechState::Silence,
            energy_threshold,
        }
    }

    /// Processes a single 16kHz PCM audio chunk and updates the conversational state.
    pub fn process_frame(&mut self, samples: &[f32]) -> SpeechState {
        // Calculate Root Mean Square (RMS) frame energy
        let sum_sq: f32 = samples.iter().map(|&s| s * s).sum();
        let rms = (sum_sq / samples.len().max(1) as f32).sqrt();

        let is_speech = rms > self.energy_threshold;
        let now = Instant::now();

        if is_speech {
            self.last_speech_time = Some(now);
            self.current_state = SpeechState::Speaking;
            SpeechState::Speaking
        } else if let Some(last_speech) = self.last_speech_time {
            let elapsed = now.duration_since(last_speech);
            if elapsed >= self.silence_threshold {
                self.last_speech_time = None;
                self.current_state = SpeechState::TurnCompleted;
                SpeechState::TurnCompleted
            } else {
                self.current_state = SpeechState::WaitingForTurnCompletion;
                SpeechState::WaitingForTurnCompletion
            }
        } else {
            self.current_state = SpeechState::Silence;
            SpeechState::Silence
        }
    }

    pub fn reset(&mut self) {
        self.last_speech_time = None;
        self.current_state = SpeechState::Silence;
    }
}
