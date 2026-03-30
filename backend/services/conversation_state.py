# services/conversation_state.py
"""
Per-call state machine for complaint collection.

Stages:
  idle        → first message not yet received
  collecting  → gathering name / location / description
  confirming  → reading back details, awaiting yes/no
  registered  → complaint saved
  general     → non-complaint free-form chat
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional


@dataclass
class ConversationState:
    call_id: str
    stage: str = "idle"
    intent: str = "unknown"
    category: str = ""
    language: str = "English"
    lang_code: str = "en"       # Whisper/gTTS code: "en", "hi", etc.

    citizen_name: Optional[str] = None
    location: Optional[str]     = None
    description: Optional[str]  = None

    history: List[Dict[str, str]] = field(default_factory=list)

    def add_turn(self, role: str, content: str):
        self.history.append({"role": role, "content": content})

    def history_for_llm(self) -> List[Dict[str, str]]:
        return self.history[-10:]

    def _valid(self, v: Optional[str]) -> bool:
        """True only if field is set to a real non-junk value."""
        return bool(v and str(v).strip().lower() not in ("null", "none", "na", "n/a", ""))

    def missing_fields(self) -> List[str]:
        missing = []
        if not self._valid(self.citizen_name):
            missing.append("name")
        if not self._valid(self.location):
            missing.append("location")
        if not self._valid(self.description):
            missing.append("description of the issue")
        return missing

    def is_complete(self) -> bool:
        return (self._valid(self.citizen_name)
                and self._valid(self.location)
                and self._valid(self.description))


# ── In-memory registry ────────────────────────────────────────────────────────

_states: Dict[str, ConversationState] = {}


def get_or_create(call_id: str) -> ConversationState:
    if call_id not in _states:
        _states[call_id] = ConversationState(call_id=call_id)
    return _states[call_id]


def reset(call_id: str):
    """
    Call this when a call ends or a new browser session starts.
    Wipes state so the next call starts fresh from 'idle'.
    """
    _states.pop(call_id, None)


def clear(call_id: str):
    """Alias for reset — kept for backwards compat."""
    reset(call_id)
