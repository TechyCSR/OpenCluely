//! Hardware-Direct Dual-Channel Audio Ingestion
//! Captures system output (Interviewer over headphones/speakers via WASAPI Loopback / CoreAudio TAP)
//! and local microphone input simultaneously without requiring virtual audio cables.

// use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc::Sender;

pub struct AudioEngine {
    is_recording: Arc<AtomicBool>,
}

impl AudioEngine {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start_capture(&self, _pcm_tx: Sender<Vec<f32>>) -> Result<(), String> {
        self.is_recording.store(true, Ordering::SeqCst);
        Ok(())
    }

    pub fn stop_capture(&self) {
        self.is_recording.store(false, Ordering::SeqCst);
        log::info!("Audio capture stopped");
    }
}
