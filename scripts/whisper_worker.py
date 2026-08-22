import base64
import gc
import json
import os
import sys
import traceback
import wave

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')

import numpy as np
import torch
import whisper

try:
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
except Exception:
    pass


model = None
model_name = None
model_dir = None
model_device = None
last_language = None


def send(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + '\n')
    sys.stdout.flush()


def unload_model():
    global model, model_name, model_dir, model_device, last_language
    model = None
    model_name = None
    model_dir = None
    model_device = None
    last_language = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def ensure_model(request):
    global model, model_name, model_dir, model_device
    requested_name = request.get('model') or 'small'
    requested_dir = request.get('model_dir') or None
    requested_device = request.get('device') or 'auto'
    if requested_device == 'auto':
        requested_device = 'cuda' if torch.cuda.is_available() else 'cpu'

    if requested_device == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError(
            'CUDA was requested but this Python environment has no CUDA-enabled PyTorch build'
        )

    # Keep the loaded weights if the name and device match. Interview Mode
    # must not reload Whisper just because model_dir formatting differs.
    if model is not None and model_name == requested_name and model_device == requested_device:
        return model, requested_device

    if (
        model is None
        or model_name != requested_name
        or model_dir != requested_dir
        or model_device != requested_device
    ):
        unload_model()
        model = whisper.load_model(
            requested_name,
            device=requested_device,
            download_root=requested_dir,
        )
        model_name = requested_name
        model_dir = requested_dir
        model_device = requested_device

    return model, requested_device


def resample_to_whisper(samples, sample_rate):
    if sample_rate == whisper.audio.SAMPLE_RATE or samples.size == 0:
        return samples
    output_size = max(1, round(samples.size * whisper.audio.SAMPLE_RATE / sample_rate))
    source_positions = np.arange(samples.size, dtype=np.float64)
    target_positions = np.linspace(0, samples.size - 1, output_size)
    return np.interp(target_positions, source_positions, samples).astype(np.float32)


def load_pcm_b64(b64, sample_rate=16000):
    raw = base64.b64decode(b64)
    samples = np.frombuffer(raw, dtype='<i2').astype(np.float32)
    samples /= 32768.0
    return resample_to_whisper(samples, int(sample_rate or 16000))


def load_audio_input(audio_path):
    """Read the app's PCM WAV directly so ffmpeg is not required for recording."""
    if not str(audio_path).lower().endswith('.wav'):
        return audio_path

    try:
        with wave.open(audio_path, 'rb') as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            frames = wav_file.readframes(wav_file.getnframes())

        if sample_width != 2:
            return audio_path

        samples = np.frombuffer(frames, dtype='<i2').astype(np.float32)
        if channels > 1:
            samples = samples.reshape(-1, channels).mean(axis=1)
        samples /= 32768.0

        return resample_to_whisper(samples, sample_rate)
    except (OSError, EOFError, wave.Error, ValueError):
        # Non-PCM or malformed WAV files can still use Whisper's normal
        # filename loader when ffmpeg is available on the host.
        return audio_path


def transcribe(request):
    global last_language
    loaded_model, device = ensure_model(request)
    language = request.get('language') or None
    if language in ('auto', 'detect', ''):
        language = None

    fast = bool(request.get('fast') or request.get('rolling'))
    if language is None and last_language:
        language = last_language
    elif language is None and fast:
        # Language detection is a second encoder pass. Rolling captions cannot
        # afford it; interviews are English unless the user set a language.
        language = 'en'

    if request.get('pcm_b64'):
        audio = load_pcm_b64(request.get('pcm_b64'), request.get('sample_rate') or 16000)
    else:
        audio_path = request.get('audio_path')
        if not audio_path:
            raise ValueError('transcribe requires pcm_b64 or audio_path')
        audio = load_audio_input(audio_path)

    decode_opts = {
        'language': language,
        'task': 'transcribe',
        'fp16': device == 'cuda' and not fast,
        'verbose': None,
        'temperature': 0,
        'condition_on_previous_text': False,
    }
    if fast:
        decode_opts['beam_size'] = 1
        decode_opts['best_of'] = 1
        decode_opts['fp16'] = False if device == 'cpu' else decode_opts['fp16']
        decode_opts['without_timestamps'] = True

    prompt = request.get('initial_prompt')
    if prompt:
        decode_opts['initial_prompt'] = prompt

    inference = torch.inference_mode if hasattr(torch, 'inference_mode') else torch.no_grad
    try:
        with inference():
            result = loaded_model.transcribe(audio, **decode_opts)
    except TypeError:
        decode_opts.pop('without_timestamps', None)
        with inference():
            result = loaded_model.transcribe(audio, **decode_opts)

    detected = result.get('language') or language
    if detected:
        last_language = detected

    text = (result.get('text') or '').strip()
    return {
        'text': text,
        'language': detected,
        'device': device,
        'model': model_name,
        'cuda_available': torch.cuda.is_available(),
        'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


send({
    'event': 'ready',
    'pid': os.getpid(),
    'torch': torch.__version__,
    'cuda_available': torch.cuda.is_available(),
    'torch_cuda': torch.version.cuda,
    'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
})

for raw_line in sys.stdin:
    raw_line = raw_line.strip()
    if not raw_line:
        continue

    request_id = None
    try:
        request = json.loads(raw_line)
        request_id = request.get('id')
        action = request.get('action')

        if action == 'transcribe':
            send({'id': request_id, 'ok': True, **transcribe(request)})
        elif action == 'warmup':
            _, device = ensure_model(request)
            send({
                'id': request_id,
                'ok': True,
                'warmed': True,
                'device': device,
                'model': model_name,
                'cuda_available': torch.cuda.is_available(),
                'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            })
        elif action == 'unload':
            unload_model()
            send({'id': request_id, 'ok': True, 'unloaded': True})
        elif action == 'shutdown':
            unload_model()
            send({'id': request_id, 'ok': True, 'shutdown': True})
            break
        else:
            raise ValueError(f'Unsupported worker action: {action}')
    except Exception as error:
        send({
            'id': request_id,
            'ok': False,
            'error': str(error),
            'traceback': traceback.format_exc(),
        })
