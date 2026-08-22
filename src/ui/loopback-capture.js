(() => {
  const logger = {
    info: (...args) => console.log('[LOOPBACK]', ...args),
    warn: (...args) => console.warn('[LOOPBACK]', ...args),
    error: (...args) => console.error('[LOOPBACK]', ...args)
  };

  let micStream = null;
  let loopbackStream = null;
  let audioContext = null;
  let scriptNode = null;
  let sourceNode = null;
  let resumeTimer = null;
  let capturing = false;
  let loggedSettings = false;

  function resampleFloatToPcm16(inputFloat, inputRate, outRate) {
    const inLen = inputFloat.length;
    if (!inLen) return new Int16Array(0);
    const toInt16 = (sample) => {
      const s = Math.max(-1, Math.min(1, sample));
      return s < 0 ? s * 0x8000 : s * 0x7FFF;
    };
    if (inputRate === outRate) {
      const out = new Int16Array(inLen);
      for (let i = 0; i < inLen; i++) out[i] = toInt16(inputFloat[i]);
      return out;
    }
    const outCount = Math.max(1, Math.round(inLen * outRate / inputRate));
    const out = new Int16Array(outCount);
    const ratio = inputRate / outRate;
    for (let i = 0; i < outCount; i++) {
      const src = i * ratio;
      const i0 = Math.min(inLen - 1, Math.floor(src));
      const i1 = Math.min(inLen - 1, i0 + 1);
      const frac = src - i0;
      out[i] = toInt16(inputFloat[i0] * (1 - frac) + inputFloat[i1] * frac);
    }
    return out;
  }

  function mixToMono(event) {
    const channels = event.inputBuffer.numberOfChannels;
    const ch0 = event.inputBuffer.getChannelData(0);
    if (channels < 2) return ch0;
    const ch1 = event.inputBuffer.getChannelData(1);
    const mixed = new Float32Array(ch0.length);
    for (let i = 0; i < ch0.length; i++) mixed[i] = (ch0[i] + ch1[i]) * 0.5;
    return mixed;
  }

  function report(payload) {
    try {
      if (window.electronAPI && window.electronAPI.sendLoopbackStatus) {
        window.electronAPI.sendLoopbackStatus(payload);
      }
    } catch (_) { /* ignore */ }
    logger.info(payload);
  }

  async function openMicKeepAlive() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (error) {
      logger.warn('mic keep-alive failed', error.message);
    }
  }

  async function openLoopbackStream() {
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 16, height: 16, frameRate: 1 },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2
          }
        });
        if (stream.getAudioTracks().length) {
          return stream;
        }
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        logger.warn('getDisplayMedia failed', error.message);
      }
    }

    const sourceId = window.electronAPI.getLoopbackSourceId
      ? await window.electronAPI.getLoopbackSourceId()
      : null;
    if (!sourceId) {
      throw new Error('no desktop source for loopback');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 16,
          maxHeight: 16
        }
      }
    });
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('desktop capture had no audio track');
    }
    return stream;
  }

  function pipeStream(stream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx({ sampleRate: 16000 });
    const nativeRate = audioContext.sampleRate || 16000;
    sourceNode = audioContext.createMediaStreamSource(stream);
    const inCh = Math.max(1, Math.min(2, stream.getAudioTracks()[0] && (stream.getAudioTracks()[0].getSettings().channelCount || 2) || 2));
    scriptNode = audioContext.createScriptProcessor(4096, inCh, 1);

    const track = stream.getAudioTracks()[0];
    const settings = track && typeof track.getSettings === 'function' ? track.getSettings() : {};
    report({
      event: 'capture-started',
      contextRate: nativeRate,
      trackRate: settings.sampleRate || null,
      trackChannels: settings.channelCount || inCh,
      label: (track && track.label) || ''
    });

    scriptNode.onaudioprocess = (event) => {
      if (!capturing || !window.electronAPI || !window.electronAPI.sendAudioChunk) return;
      const mixed = mixToMono(event);
      const pcm16 = resampleFloatToPcm16(mixed, nativeRate, 16000);
      if (!pcm16.byteLength) return;
      if (!loggedSettings) {
        loggedSettings = true;
        let sum = 0;
        for (let i = 0; i < Math.min(pcm16.length, 512); i++) {
          const s = pcm16[i] / 32768;
          sum += s * s;
        }
        report({
          event: 'first-pcm',
          samples: pcm16.length,
          rms: Math.sqrt(sum / Math.min(pcm16.length, 512))
        });
      }
      const copy = pcm16.buffer.slice(pcm16.byteOffset, pcm16.byteOffset + pcm16.byteLength);
      window.electronAPI.sendAudioChunk(copy, 'loopback');
    };

    const mute = audioContext.createGain();
    mute.gain.value = 0;
    sourceNode.connect(scriptNode);
    scriptNode.connect(mute);
    mute.connect(audioContext.destination);
    audioContext.resume().catch(() => {});
    resumeTimer = setInterval(() => {
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
    }, 1000);
  }

  function stopTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch (_) {}
    });
  }

  async function start() {
    if (capturing) return;
    capturing = true;
    loggedSettings = false;
    await openMicKeepAlive();
    try {
      loopbackStream = await openLoopbackStream();
      pipeStream(loopbackStream);
    } catch (error) {
      capturing = false;
      report({ event: 'capture-failed', error: error.message });
    }
  }

  function stop() {
    capturing = false;
    if (resumeTimer) {
      clearInterval(resumeTimer);
      resumeTimer = null;
    }
    try {
      if (scriptNode) {
        scriptNode.disconnect();
        scriptNode.onaudioprocess = null;
        scriptNode = null;
      }
      if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
    } catch (_) { /* ignore */ }
    stopTracks(loopbackStream);
    stopTracks(micStream);
    loopbackStream = null;
    micStream = null;
  }

  if (window.electronAPI && window.electronAPI.onStartLoopbackCapture) {
    window.electronAPI.onStartLoopbackCapture(() => { start(); });
  }
  if (window.electronAPI && window.electronAPI.onStopLoopbackCapture) {
    window.electronAPI.onStopLoopbackCapture(() => { stop(); });
  }
  if (window.electronAPI && window.electronAPI.receive) {
    window.electronAPI.receive('start-loopback-capture', () => { start(); });
    window.electronAPI.receive('stop-loopback-capture', () => { stop(); });
  }
})();
