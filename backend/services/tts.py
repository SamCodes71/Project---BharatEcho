# services/tts.py
#
# gTTS-based TTS with language support.
# Accepts a lang_code parameter so Hindi responses are spoken in Hindi.

import uuid
import os
import time
from gtts import gTTS
from backend.config import BASE_URL, STATIC_DIR

OUTPUT_DIR = STATIC_DIR
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Saving audio to:", OUTPUT_DIR)

# gTTS language codes for supported languages
_GTTS_LANG = {
    "en": "en",
    "hi": "hi",
    "te": "te",
    "ta": "ta",
    "bn": "bn",
    "gu": "gu",
    "mr": "mr",
    "kn": "kn",
    "pa": "pa",
    "ur": "ur",
}


def text_to_speech(text: str, lang_code: str = "en") -> str:
    """
    Convert text to speech in the given language.
    Returns the full public URL of the saved MP3.

    lang_code: Whisper/gTTS code e.g. "en", "hi"
    """
    filename = f"{uuid.uuid4()}.mp3"
    filepath = os.path.join(OUTPUT_DIR, filename)

    gtts_lang = _GTTS_LANG.get(lang_code, "en")

    tts = gTTS(text=text, lang=gtts_lang)
    tts.save(filepath)

    # Wait until file is fully written before returning URL
    for _ in range(20):
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            try:
                with open(filepath, "rb") as f:
                    f.read(10)
                break
            except Exception:
                pass
        time.sleep(0.05)

    print(f"FINAL FILE READY: {filepath} (lang={gtts_lang})")
    return f"{BASE_URL.rstrip('/')}/static/{filename}"


def get_filepath_from_url(url: str) -> str:
    """Extract the local file path from a full static URL."""
    filename = url.split("/static/")[-1]
    return os.path.join(OUTPUT_DIR, filename)
