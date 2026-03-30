# routes/ai.py
from fastapi import APIRouter, UploadFile, File, Request
from pydantic import BaseModel
import uuid, os
from backend.services.pipeline import run_pipeline_text, run_pipeline
from backend.config import TEMP_DIR

os.makedirs(TEMP_DIR, exist_ok=True)

router = APIRouter(prefix="/ai")


# ── Voice chat ────────────────────────────────────────────────────────────────

@router.post("/chat")
async def chat(request: Request, audio: UploadFile = File(...)):
    """Audio → STT → pipeline → TTS. Returns full audio URL (set by tts.py)."""
    call_id = request.query_params.get("call_id") or None

    filename = os.path.join(TEMP_DIR, f"{uuid.uuid4()}.wav")
    with open(filename, "wb") as f:
        f.write(await audio.read())

    result = run_pipeline(filename, call_id=call_id)

    # tts.py already returns the full URL — do NOT prepend BASE_URL again
    return {
        "audio_url": result["audio_path"],
        "user_text": result["user_text"],
        "ai_text":   result["ai_text"],
        "sentiment": result["sentiment"],
        "complaint": result.get("complaint"),
    }


# ── Text chat ─────────────────────────────────────────────────────────────────

class TextInput(BaseModel):
    text: str


@router.post("/text")
async def text_chat(request: Request, body: TextInput):
    """Typed message → pipeline → text response only (no TTS)."""
    session_id = request.query_params.get("session_id") or None

    result = run_pipeline_text(body.text, call_id=session_id)

    return {
        "ai_text":   result["ai_text"],
        "sentiment": result["sentiment"],
        "complaint": result.get("complaint"),
    }
