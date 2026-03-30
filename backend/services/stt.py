# services/stt.py
#
# Whisper STT with explicit language detection.
# When Hindi is detected the model is re-run with language="hi" so Whisper
# returns proper Devanagari script — NOT romanised Hinglish.
# The pipeline receives the raw Devanagari text and all Hindi responses are
# also written in Devanagari, so the full round-trip is native Hindi.

import os
import whisper

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
model = whisper.load_model(MODEL_SIZE)

# Whisper language codes → friendly names stored in DB / state
_LANG_MAP = {
    "en": "English",
    "hi": "Hindi",
    "te": "Telugu",
    "ta": "Tamil",
    "bn": "Bengali",
    "gu": "Gujarati",
    "mr": "Marathi",
    "kn": "Kannada",
    "pa": "Punjabi",
    "ur": "Urdu",
}


def transcribe(audio_path: str) -> dict:
    """
    Two-pass transcription:
      Pass 1 — auto-detect language from the first 30 s of audio.
      Pass 2 — if Hindi detected, re-transcribe forcing language="hi" so
               Whisper outputs Devanagari Unicode.
               For English (and other languages) one pass is enough.

    Returns:
        {
            "text":      str   — Devanagari for Hindi, Latin otherwise
            "language":  str   — friendly name e.g. "Hindi", "English"
            "lang_code": str   — ISO code e.g. "hi", "en"
        }
    """
    # ── Pass 1: detect language ───────────────────────────────────────────────
    audio    = whisper.load_audio(audio_path)
    clip     = whisper.pad_or_trim(audio)
    mel      = whisper.log_mel_spectrogram(clip).to(model.device)
    _, probs = model.detect_language(mel)
    lang_code = max(probs, key=probs.get)
    confidence = probs.get(lang_code, 0.0)
    print(f"[STT] detected lang={lang_code!r} conf={confidence:.2f}")

    # ── Pass 2: transcribe with explicit language ─────────────────────────────
    if lang_code == "hi":
        # Force Hindi so output is Devanagari script
        result = model.transcribe(audio_path, language="hi")
    elif lang_code == "en":
        result = model.transcribe(audio_path, language="en")
    else:
        # Other Indian languages — let Whisper handle natively
        result = model.transcribe(audio_path, language="hi")

    text      = result.get("text", "").strip()
    lang_name = _LANG_MAP.get(lang_code, "English")

    print(f"[STT] lang={lang_code!r} text={text!r}")
    return {
        "text":      text,
        "language":  lang_name,
        "lang_code": lang_code,
    }
