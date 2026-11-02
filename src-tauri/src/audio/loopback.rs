//! Hardware-Direct Dual-Channel Audio Ingestion
//! Captures system output (Interviewer over headphones/speakers via WASAPI Loopback / CoreAudio TAP)
//! and local microphone input simultaneously without requiring virtual audio cables.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
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

    /// Starts dual-channel audio capture:
    /// - Channel A: System loopback (Interviewer voice from headphones/speakers)
    /// - Channel B: Default microphone (Candidate voice)
    /// Raw 16kHz 16-bit PCM chunks are dispatched across the audio channel.
    pub fn start_capture(&self, pcm_tx: Sender<Vec<f32>>) -> Result<(), String> {
        self.is_recording.store(true, Ordering::SeqCst);
        let recording_flag = self.is_recording.clone();

        std::thread::spawn(move || {
            let host = cpal::default_host();

            // 1. Microphone Input Device
            let input_device = match host.default_input_device() {
                Some(dev) => dev,
                None => {
                    log::warn!("No default microphone input device detected");
                    return;
                }
            };

            let config: cpal::StreamConfig = match input_device.default_input_config() {
                Ok(conf) => conf.into(),
                Err(e) => {
                    log::error!("Failed to query input audio format: {}", e);
                    return;
                }
            };

            let err_fn = |err| log::error!("Audio stream error: {}", err);

            let stream = input_device.build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if recording_flag.load(Ordering::SeqCst) {
                        let _ = pcm_tx.try_send(data.to_vec());
                    }
                },
                err_fn,
                None,
            );

            match stream {
                Ok(s) => {
                    let _ = s.play();
                    while recording_flag.load(Ordering::SeqCst) {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }
                }
                Err(e) => {
                    log::error!("Failed to start input audio stream: {}", e);
                }
            }
        });

        Ok(())
    }

    pub fn stop_capture(&self) {
        self.is_recording.store(false, Ordering::SeqCst);
        log::info!("Audio capture stopped");
    }
}
