# services/llm.py
"""
LLM is used ONLY as a last-resort fallback for truly open-ended questions
that the keyword router cannot handle.

phi is a small but capable model. Kept constraints to ensure quality:
1. The prompt is kept to under 200 characters of instruction
2. num_predict is capped at 60 tokens (1-2 sentences max)
3. temperature is 0.1 (near-deterministic)
4. We post-process the output to strip markdown/formatting
5. We validate the output — if it looks like hallucination we return a safe fallback
"""

import requests
import re

import os
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434") + "/api/generate"
MODEL      = os.environ.get("OLLAMA_MODEL", "phi")

# Absolute minimum prompt — the shorter the better for tiny models
# Base system prompt — language instruction is appended at runtime
_SYSTEM_PROMPT_BASE = (
    "You are a government helpline assistant for India. "
    "Answer in 1-2 sentences only. Plain text. No lists. No markdown. "
    "Only answer about government services. "
)
_SYSTEM_PROMPT_EN = _SYSTEM_PROMPT_BASE + "If unsure, say: I will connect you with an officer who can help."
_SYSTEM_PROMPT_HI = _SYSTEM_PROMPT_BASE + (
    "Always reply in Hindi (Roman script is fine). "
    "Agar jawab na pata ho toh kahein: Main aapko sambandhhit adhikari se jod deta hoon."
)

# Signs that the model has started hallucinating or gone off-topic
_HALLUCINATION_PATTERNS = [
    r"\*\*",           # markdown bold
    r"^\s*[-•]",       # bullet points
    r"```",            # code blocks
    r"User:",          # leaked prompt
    r"Citizen:",       # leaked prompt
    r"Assistant:",     # leaked prompt
    r"\n\n",           # multi-paragraph (should be one sentence)
    r"I am an AI",     # self-reference
    r"As an AI",
    r"I cannot",       # refusal spam
    r"I'm not able",
]

_SAFE_FALLBACK_EN = (
    "I understand your concern. "
    "Please stay on the line and I will connect you with the appropriate department officer."
)
_SAFE_FALLBACK_HI = (
    "Main aapki baat samajh raha hoon. "
    "Kripaya line par bane rahein, main aapko sambandhhit vibhag se jod deta hoon."
)
_SAFE_FALLBACK = _SAFE_FALLBACK_EN  # default


def generate_response(text: str, history: list | None = None,
                      lang_code: str = "en") -> str:
    """
    Called ONLY from the 'general' and 'registered' pipeline stages.
    lang_code: "en" or "hi" — determines response language.
    """
    system_prompt = _SYSTEM_PROMPT_HI if lang_code.startswith("hi") else _SYSTEM_PROMPT_EN

    ctx = ""
    if history:
        for turn in history[-2:]:
            role = "C" if turn["role"] == "user" else "A"
            content = turn["content"][:80]
            ctx += f"{role}: {content}\n"

    if ctx:
        prompt = f"{system_prompt}\n\n{ctx}C: {text}\nA:"
    else:
        prompt = f"{system_prompt}\n\nC: {text}\nA:"

    raw = _call_llm(prompt)
    return _validate(raw, lang_code=lang_code)


def _call_llm(prompt: str) -> str:
    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model":  MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,        # near-deterministic
                    "top_p":       0.8,
                    "num_predict": 120,         # phi can handle 2-3 sentences
                    "repeat_penalty": 1.3,      # penalise repetition
                    "stop": ["\n", "C:", "A:", "Citizen:", "User:", "Assistant:"],
                },
            },
            timeout=30,
        )
        data = resp.json()
        return (data.get("response") or
                data.get("message", {}).get("content") or "")
    except Exception as e:
        print(f"LLM error: {e}")
        return ""


def _validate(raw: str, lang_code: str = "en") -> str:
    """Strip formatting and detect hallucination. Return safe fallback if bad."""
    fallback = _SAFE_FALLBACK_HI if lang_code.startswith("hi") else _SAFE_FALLBACK_EN
    if not raw or not raw.strip():
        return fallback

    # Strip leading punctuation/formatting
    cleaned = raw.strip().lstrip("*#-•→ ").strip()

    # Check for hallucination patterns
    for pattern in _HALLUCINATION_PATTERNS:
        if re.search(pattern, cleaned):
            print(f"[LLM] Hallucination detected ({pattern!r}), using fallback")
            return fallback

    # Must be at least 10 chars and end somewhat naturally
    if len(cleaned) < 10:
        return fallback

    # Truncate to first sentence if model produced more
    first_sentence = re.split(r'(?<=[.!?])\s', cleaned)[0]
    return first_sentence.strip()
