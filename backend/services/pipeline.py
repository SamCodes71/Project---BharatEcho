# services/pipeline.py
"""
Stateful voice/text pipeline with full Hindi (Devanagari) support.

Language handling:
  - STT now returns real Devanagari for Hindi speech (stt.py two-pass).
  - All Hindi AI responses are written in Devanagari — no Hinglish.
  - TTS receives the Devanagari string and gTTS renders it as native Hindi.
  - Language is detected per-utterance and stored on ConversationState.
  - If the caller switches language mid-call, the pipeline follows immediately.
"""

from backend.services.stt import transcribe
from backend.services.tts import text_to_speech
from backend.services.knowledge import P_DATA, SCHEMES
from backend.services import conversation_state as cs
from backend.services.extractor import extract_fields, extract_correction, is_confirmation
from backend.routes import data_base as db
import asyncio


# ── asyncio bridge ────────────────────────────────────────────────────────────

def _fire_and_forget(coro):
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(coro)
    except RuntimeError:
        pass


async def _broadcast(event: str, data: dict):
    try:
        await db.broadcast(event, data)
    except Exception as e:
        print(f"Broadcast error [{event}]: {e}")


# ── Intent / sentiment ────────────────────────────────────────────────────────

def detect_initial_intent(text: str) -> str:
    t = text.lower()
    complaint_en = [
        "complaint", "issue", "problem", "broken", "not working",
        "lodge", "file", "report", "electric", "power", "water",
        "road", "pothole", "drainage", "garbage", "sanit", "register",
    ]
    # Devanagari Hindi complaint keywords
    complaint_hi = ["शिकायत", "समस्या", "खराब", "बिजली", "पानी", "सड़क",
                    "कचरा", "नाली", "दर्ज", "दिक्कत", "तकलीफ"]
    if any(x in t for x in complaint_en) or any(x in text for x in complaint_hi):
        return "complaint"

    scheme_en = ["scheme", "yojana", "benefit", "pm kisan", "ayushman",
                 "ujjwala", "subsidy"]
    scheme_hi = ["योजना", "लाभ", "सब्सिडी", "सरकारी"]
    if any(x in t for x in scheme_en) or any(x in text for x in scheme_hi):
        return "scheme"

    if any(x in t for x in ["survey", "feedback", "rating", "satisfied"]) or \
       any(x in text for x in ["सर्वेक्षण", "प्रतिक्रिया"]):
        return "survey"

    return "general"


def detect_category_keywords(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["electric", "power", "light", "voltage",
                              "wire", "circuit", "transformer", "meter"]) or \
       any(w in text for w in ["बिजली", "विद्युत", "करंट", "बत्ती"]):
        return "electricity"
    if any(w in t for w in ["water", "pipe", "tap", "supply", "drainage",
                              "sewage", "nali", "naali"]) or \
       any(w in text for w in ["पानी", "नल", "नाली", "जल"]):
        return "water"
    if any(w in t for w in ["road", "pothole", "street", "footpath",
                              "highway", "sadak"]) or \
       any(w in text for w in ["सड़क", "रास्ता", "गड्ढा"]):
        return "road"
    if any(w in t for w in ["garbage", "waste", "sanit", "toilet",
                              "sweeping", "dustbin"]) or \
       any(w in text for w in ["कचरा", "सफाई", "शौचालय", "गंदगी"]):
        return "sanitation"
    return "general"


def detect_sentiment(text: str) -> str:
    t = text.lower()
    angry_en = ["angry", "unacceptable", "useless", "terrible", "horrible",
                "disgusting", "fed up"]
    angry_hi = ["बहुत बुरा", "गुस्सा", "नाराज़", "बेकार", "बकवास"]
    if any(w in t for w in angry_en) or any(w in text for w in angry_hi):
        return "Angry"

    neg_en = ["bad", "problem", "issue", "broken", "not working", "failed", "complaint"]
    neg_hi = ["परेशानी", "दिक्कत", "तकलीफ", "खराब", "समस्या", "शिकायत"]
    if any(w in t for w in neg_en) or any(w in text for w in neg_hi):
        return "Negative"

    pos_en = ["thank", "thanks", "good", "great", "resolved", "happy",
              "satisfied", "excellent"]
    pos_hi = ["धन्यवाद", "शुक्रिया", "अच्छा", "बहुत अच्छा", "ठीक है", "सही है"]
    if any(w in t for w in pos_en) or any(w in text for w in pos_hi):
        return "Positive"

    return "Neutral"


# ── Bilingual prompt helpers ──────────────────────────────────────────────────
# All Hindi strings are written in Devanagari.

_ASK_NEXT_EN = {
    "name":                     "Please tell me your full name.",
    "location":                 "What is your area or address where this issue is occurring?",
    "description of the issue": "Please briefly describe the problem.",
}

_ASK_NEXT_HI = {
    "name":                     "कृपया अपना पूरा नाम बताएँ।",
    "location":                 "यह समस्या कहाँ हो रही है? अपना क्षेत्र या पता बताएँ।",
    "description of the issue": "कृपया समस्या का संक्षिप्त विवरण दें।",
}


def _is_hindi(state: cs.ConversationState) -> bool:
    lang = getattr(state, "lang_code", "en")
    return lang.startswith("hi") or lang == "ur"


def _ask_next(state: cs.ConversationState) -> str | None:
    missing = state.missing_fields()
    if not missing:
        return None
    table = _ASK_NEXT_HI if _is_hindi(state) else _ASK_NEXT_EN
    field = missing[0]
    return table.get(field,
                     f"कृपया अपना {field} बताएँ।" if _is_hindi(state)
                     else f"Please provide your {field}.")


def _confirmation_prompt(state: cs.ConversationState) -> str:
    if _is_hindi(state):
        return (
            f"मैं आपकी जानकारी की पुष्टि करता हूँ। "
            f"नाम: {state.citizen_name}। "
            f"स्थान: {state.location}। "
            f"समस्या: {state.description}। "
            f"विभाग: {state.category or 'सामान्य'}। "
            f"पुष्टि के लिए 'हाँ' कहें या बदलाव के लिए 'नहीं' कहें।"
        )
    return (
        f"Let me confirm your details. "
        f"Name: {state.citizen_name}. "
        f"Location: {state.location}. "
        f"Issue: {state.description}. "
        f"Department: {state.category or 'general'}. "
        f"Say yes to confirm or no to change anything."
    )


def _handle_scheme(text: str, lang_code: str = "en") -> str:
    t = text.lower()
    for key, info in {**P_DATA, **SCHEMES}.items():
        if key in t:
            return info
    if lang_code.startswith("hi"):
        return ("कृपया बताएँ आप किस योजना के बारे में जानना चाहते हैं। "
                "उदाहरण: पीएम किसान, आयुष्मान भारत, या उज्ज्वला योजना।")
    return ("Please specify which scheme you want information about. "
            "For example: PM Kisan, Ayushman Bharat, or Ujjwala Yojana.")


# ── Bilingual scripted responses ──────────────────────────────────────────────
# Format: (keyword_list, english_response, hindi_response_in_devanagari)
# Hindi keywords in keyword_list are Devanagari so they match STT output.

_SCRIPTED = [
    (
        ["hello", "hi ", "namaste", "namaskar", "hey", "good morning",
         "नमस्ते", "नमस्कार", "प्रणाम"],
        "Namaste! I am BharatEcho, your government services assistant. "
        "You can register a complaint, ask about a government scheme, or request service information.",
        "नमस्ते! मैं BharatEcho हूँ, आपका सरकारी सेवा सहायक। "
        "आप शिकायत दर्ज कर सकते हैं, किसी योजना के बारे में पूछ सकते हैं, "
        "या सेवा संबंधी जानकारी ले सकते हैं।",
    ),
    (
        ["thank", "thanks", "shukriya", "dhanyawad", "dhanyavad",
         "धन्यवाद", "शुक्रिया"],
        "You are welcome! Is there anything else I can help you with?",
        "आपका स्वागत है! क्या मैं आपकी और कोई सहायता कर सकता हूँ?",
    ),
    (
        ["emergency", "urgent", "fire brigade", "flood", "accident", "ambulance",
         "आपातकाल", "जरूरी", "आग", "बाढ़"],
        "For emergencies please call 112 immediately. "
        "For fire call 101, for ambulance call 108, for police call 100.",
        "आपातकालीन स्थिति में तुरंत 112 पर कॉल करें। "
        "आग के लिए 101, एम्बुलेंस के लिए 108, पुलिस के लिए 100।",
    ),
    (
        ["status of", "check my complaint", "complaint id", "track complaint",
         "शिकायत की स्थिति", "शिकायत जाँच"],
        "To check your complaint status, please provide your complaint ID "
        "or visit the nearest citizen service centre. You can also call 1916.",
        "अपनी शिकायत की स्थिति जानने के लिए शिकायत ID बताएँ, "
        "या निकटतम नागरिक सेवा केंद्र जाएँ। आप 1916 पर भी कॉल कर सकते हैं।",
    ),
    (
        ["government scheme", "sarkari yojana", "kaun si yojana",
         "सरकारी योजना", "कौन सी योजना", "योजना बताएँ"],
        "I can provide information on PM Kisan, Ayushman Bharat, Ujjwala Yojana, "
        "PM Awas Yojana and many more. Which scheme would you like to know about?",
        "मैं पीएम किसान, आयुष्मान भारत, उज्ज्वला योजना, पीएम आवास योजना "
        "और अनेक योजनाओं की जानकारी दे सकता हूँ। "
        "आप किस योजना के बारे में जानना चाहते हैं?",
    ),
    (
        ["bye", "goodbye", "alvida", "ok thanks", "that is all", "that's all",
         "अलविदा", "बस इतना ही", "धन्यवाद बाय"],
        "Thank you for contacting BharatEcho. Have a great day!",
        "BharatEcho से संपर्क करने के लिए धन्यवाद। आपका दिन शुभ हो!",
    ),
]


def _keyword_answer(text: str, lang_code: str = "en") -> str | None:
    t = text.lower()
    is_hi = lang_code.startswith("hi")
    for entry in _SCRIPTED:
        keywords, en_resp, hi_resp = entry
        # Check lowercase keywords AND original text (for Devanagari)
        if any(kw in t for kw in keywords) or any(kw in text for kw in keywords):
            return hi_resp if is_hi else en_resp
    return None


def _llm_general(state: cs.ConversationState, user_text: str) -> str:
    lang_code = getattr(state, "lang_code", "en")
    scripted = _keyword_answer(user_text, lang_code=lang_code)
    if scripted:
        return scripted
    from backend.services.llm import generate_response
    history = state.history_for_llm()[:-1]
    return generate_response(user_text, history=history, lang_code=lang_code)


# ── Field extraction helpers ──────────────────────────────────────────────────

_NOT_A_NAME = [
    "circuit", "short", "electric", "power", "water", "road", "issue", "problem",
    "complaint", "register", "yes", "no", "ok", "please", "sir", "madam",
    "hello", "hi", "namaste", "help", "urgent", "broken", "light", "pipe",
    "pothole", "garbage", "waste", "supply", "outage", "cut", "damage",
    # Devanagari non-name words
    "बिजली", "पानी", "सड़क", "कचरा", "समस्या", "शिकायत", "नहीं", "हाँ",
]


def _apply_extracted(state: cs.ConversationState, extracted: dict, raw_text: str,
                      allow_overwrite: bool = False):
    """
    Merge extractor output into state.

    allow_overwrite=True is used during the correction path so the user
    can fix a wrong name/location/description without being blocked by
    the "only fill empty fields" guard.
    """
    if not extracted:
        extracted = {}

    # ── Sanitise helper — kill the string "null" that LLMs emit ───────────────
    def _s(v):
        if v is None:
            return None
        s = str(v).strip()
        return None if s.lower() in ("null", "none", "na", "n/a", "") else s

    # ── Category ──────────────────────────────────────────────────────────────
    if not state.category:
        kw_cat = detect_category_keywords(raw_text)
        if kw_cat != "general":
            state.category = kw_cat
    if not state.category:
        cat = _s(extracted.get("category"))
        if cat and cat.lower() in ("electricity", "water", "road", "sanitation", "general"):
            state.category = cat.lower()

    # ── Name ──────────────────────────────────────────────────────────────────
    name = _s(extracted.get("name"))
    if name:
        from backend.services.extractor import _is_valid_name, _looks_like_location
        if _looks_like_location(name):
            # LLM confused location for name — rescue it
            if not state.location or allow_overwrite:
                state.location = name
        elif _is_valid_name(name):
            if not state.citizen_name or allow_overwrite:
                state.citizen_name = name

    # ── Location ──────────────────────────────────────────────────────────────
    loc = _s(extracted.get("location"))
    if loc:
        loc = " ".join(loc.split())   # collapse double spaces from STT/LLM
    if loc and (not state.location or allow_overwrite):
        state.location = loc

    # ── Description ───────────────────────────────────────────────────────────
    # Resolve description AFTER name/location so the raw-text fallback doesn't
    # swallow a self-introduction sentence (e.g. "My name is X from Y").
    desc = _s(extracted.get("description"))
    raw_lower = raw_text.lower()

    # A message is "issue-like" only when it contains complaint vocabulary
    # AND the LLM hasn't already parsed it as a pure name+location utterance.
    name_and_loc_only = (
        bool(state.citizen_name or name) and
        bool(state.location or loc) and
        not desc
    )
    looks_like_issue = (
        not name_and_loc_only and
        (
            state.category is not None or
            any(w in raw_lower for w in _NOT_A_NAME) or
            any(w in raw_text for w in ["बिजली", "पानी", "सड़क", "कचरा", "समस्या"])
        )
    )
    if desc and (not state.description or allow_overwrite):
        state.description = " ".join(desc.split())
    elif looks_like_issue and not state.description and len(raw_text.split()) >= 4:
        # Use raw text as description fallback only for substantive issue sentences,
        # never for short name/address responses.
        state.description = " ".join(raw_text.split())


# ── Helpers for bilingual UI strings ─────────────────────────────────────────

def _t(state, en: str, hi: str) -> str:
    """Pick English or Devanagari Hindi based on state.lang_code."""
    return hi if _is_hindi(state) else en


# ── Main pipeline (voice) ─────────────────────────────────────────────────────

def run_pipeline(audio_path: str, call_id: str | None = None) -> dict:
    stt_result = transcribe(audio_path)
    user_text  = stt_result["text"]
    lang_code  = stt_result["lang_code"]
    lang_name  = stt_result["language"]

    print(f"[STT] {user_text!r} [{lang_code}]")

    if not user_text.strip():
        sorry = ("माफ करें, मुझे सुनाई नहीं दिया। कृपया दोबारा बोलें।"
                 if lang_code.startswith("hi")
                 else "Sorry, I didn't catch that. Could you please repeat?")
        return _build_result("", sorry, call_id, lang_code=lang_code)

    sentiment = detect_sentiment(user_text)
    state_key = call_id or "browser"
    state     = cs.get_or_create(state_key)
    state.language  = lang_name
    state.lang_code = lang_code
    state.add_turn("user", user_text)

    ai_text = _run_state_machine(state, user_text, call_id, sentiment)
    if isinstance(ai_text, dict):          # early return from confirming
        return ai_text
    return _build_result(user_text, ai_text, call_id,
                         sentiment=sentiment, lang_code=lang_code)


def _run_state_machine(state, user_text, call_id, sentiment):
    """Shared state machine for both voice and text pipelines."""

    if state.stage == "idle":
        intent = detect_initial_intent(user_text)
        state.intent = intent

        if intent == "complaint":
            state.stage = "collecting"
            # Only extract category from the trigger phrase — do NOT call
            # extract_fields/_apply_extracted here. The description fallback
            # would store "I want to register a complaint" as the issue.
            kw_cat = detect_category_keywords(user_text)
            if kw_cat != "general":
                state.category = kw_cat
            return (_t(state,
                       "I will help you register your complaint. ",
                       "मैं आपकी शिकायत दर्ज करने में सहायता करूँगा। ")
                    + (_ask_next(state) or ""))

        elif intent == "scheme":
            state.stage = "general"
            return _handle_scheme(user_text, lang_code=getattr(state, "lang_code", "en"))

        elif intent == "survey":
            state.stage = "general"
            return _t(state,
                      "On a scale of 1 to 5, how satisfied are you with government services?",
                      "1 से 5 के पैमाने पर, आप सरकारी सेवाओं से कितने संतुष्ट हैं?")

        else:
            state.stage = "general"
            return _llm_general(state, user_text)

    elif state.stage == "collecting":
        # ── Fast-path: if we are asking for a name, try direct extraction first ──
        if "name" in state.missing_fields():
            from backend.services.extractor import extract_name_direct
            direct_name = extract_name_direct(user_text)
            if direct_name:
                state.citizen_name = direct_name
                print(f"[NAME-DIRECT] {direct_name!r}")
                if state.is_complete():
                    state.stage = "confirming"
                    return _confirmation_prompt(state)
                return (_ask_next(state) or
                        _t(state, "Please provide a few more details.",
                           "कृपया थोड़ी और जानकारी दें।"))

        extracted = extract_fields(user_text)
        print(f"[EXTRACT] raw={extracted!r}")
        _apply_extracted(state, extracted, user_text)
        print(f"[STATE] name={state.citizen_name!r} loc={state.location!r} "
              f"desc={state.description!r} cat={state.category!r}")
        if state.is_complete():
            state.stage = "confirming"
            return _confirmation_prompt(state)
        return (_ask_next(state) or
                _t(state, "Please provide a few more details.",
                   "कृपया थोड़ी और जानकारी दें।"))

    elif state.stage == "confirming":
        if is_confirmation(user_text):
            complaint = db.create_complaint(
                call_id      = call_id or (state.call_id if hasattr(state, "call_id") else "unknown"),
                category     = state.category or "general",
                description  = (
                    f"{state.description} (Location: {state.location})"
                    if state.location else (state.description or user_text)
                ),
                citizen_name = state.citizen_name or "Unknown",
                phone        = "Unknown",
                language     = state.language,
            )
            try:
                for c in db.calls_db:
                    if c["id"] == call_id:
                        c["complaint_id"] = complaint["id"]
                        c["sentiment"]    = sentiment
                        break
            except Exception as e:
                print(f"[pipeline] calls_db update error (non-fatal): {e}")

            state.stage = "registered"
            try:
                _fire_and_forget(_broadcast("new_complaint", complaint))
                _fire_and_forget(_broadcast("stats_update", db.get_stats()))
            except Exception as e:
                print("[BROADCAST ERROR]", e)

            lang_code = getattr(state, "lang_code", "en")
            if lang_code.startswith("hi"):
                ai_text = (
                    f"आपकी शिकायत सफलतापूर्वक दर्ज हो गई है। "
                    f"आपका शिकायत ID {complaint['id']} है। "
                    f"{complaint['department']} विभाग 24 घंटे में आपसे संपर्क करेगा। "
                    f"क्या मैं आपकी और कोई सहायता कर सकता हूँ?"
                )
            else:
                ai_text = (
                    f"Your complaint has been registered successfully. "
                    f"Your complaint ID is {complaint['id']}. "
                    f"The {complaint['department']} team will contact you within 24 hours. "
                    f"Is there anything else I can help you with?"
                )
            # Return early with complaint attached
            return _build_result(user_text, ai_text, call_id,
                                  sentiment=sentiment, complaint=complaint,
                                  lang_code=lang_code)
        else:
            # User said "no" — figure out what they want to correct.
            # Use extract_correction (targeted prompt) so a name correction
            # doesn't accidentally wipe description/location.
            extracted = extract_correction(user_text)
            corrected_any = False
            if extracted.get("name"):
                state.citizen_name = extracted["name"]
                corrected_any = True
            if extracted.get("location"):
                state.location = extracted["location"]
                corrected_any = True
            if extracted.get("description"):
                state.description = extracted["description"]
                corrected_any = True

            if not corrected_any:
                # User just said "no" without providing a correction yet —
                # ask them which field to fix rather than looping confirmation
                state.stage = "collecting"
                missing = state.missing_fields()
                if missing:
                    return _ask_next(state)
                return _t(state,
                    "What would you like to change? Your name, location, or the issue description?",
                    "आप क्या बदलना चाहते हैं? अपना नाम, स्थान, या समस्या का विवरण?")

            state.stage = "collecting"
            next_q = _ask_next(state)
            prefix = _t(state, "Got it. ", "ठीक है। ")
            if next_q:
                return prefix + next_q
            # All fields filled after correction — go back to confirmation
            state.stage = "confirming"
            return _confirmation_prompt(state)

    elif state.stage == "registered":
        return _llm_general(state, user_text)

    else:  # general
        re_intent = detect_initial_intent(user_text)
        if re_intent == "complaint":
            state.stage  = "collecting"
            state.intent = "complaint"
            kw_cat = detect_category_keywords(user_text)
            if kw_cat != "general":
                state.category = kw_cat
            return (_t(state,
                       "I will help you register your complaint. ",
                       "मैं आपकी शिकायत दर्ज करने में सहायता करूँगा। ")
                    + (_ask_next(state) or
                       _t(state, "Please describe the problem.",
                          "कृपया समस्या का विवरण दें।")))
        elif re_intent == "scheme":
            return _handle_scheme(user_text,
                                   lang_code=getattr(state, "lang_code", "en"))
        return _llm_general(state, user_text)


def _build_result(user_text: str, ai_text: str, call_id: str | None,
                   sentiment: str = "Neutral", complaint=None,
                   lang_code: str = "en") -> dict:
    print(f"[AI] ({lang_code}) {ai_text!r}")
    if call_id:
        user_entry = db.append_transcript(call_id, "user", user_text)
        sys_entry  = db.append_transcript(call_id, "system", ai_text)
        try:
            _fire_and_forget(_broadcast("transcript_update", {
                "call_id": call_id,
                "entries": [user_entry, sys_entry],
                "sentiment": sentiment,
            }))
        except Exception as e:
            print("[TRANSCRIPT ERROR]", e)
    return {
        "audio_path": text_to_speech(ai_text, lang_code=lang_code),
        "user_text":  user_text,
        "ai_text":    ai_text,
        "sentiment":  sentiment,
        "complaint":  complaint,
        "lang_code":  lang_code,
    }


# ── Text-only pipeline ────────────────────────────────────────────────────────

def _detect_lang_from_text(text: str) -> str:
    for ch in text:
        if "\u0900" <= ch <= "\u097F":
            return "hi"
    return "en"


def run_pipeline_text(user_text: str, call_id: str | None = None) -> dict:
    print(f"[TEXT] {user_text!r}")
    if not user_text.strip():
        return {"audio_path": None, "user_text": user_text,
                "ai_text": "Please type your message.",
                "sentiment": "Neutral", "complaint": None}

    sentiment  = detect_sentiment(user_text)
    state_key  = call_id or "browser-text"
    state      = cs.get_or_create(state_key)

    lang_code = _detect_lang_from_text(user_text)
    from backend.services.stt import _LANG_MAP
    state.lang_code = lang_code
    state.language  = _LANG_MAP.get(lang_code, "English")
    state.add_turn("user", user_text)

    ai_text = _run_state_machine(state, user_text, call_id, sentiment)
    if isinstance(ai_text, dict):
        # _build_result was returned early (complaint registered)
        return {**ai_text, "audio_path": None}

    print(f"[AI-TEXT] {ai_text!r}")
    if call_id:
        user_entry = db.append_transcript(call_id, "user", user_text)
        sys_entry  = db.append_transcript(call_id, "system", ai_text)
        _fire_and_forget(_broadcast("transcript_update", {
            "call_id": call_id,
            "entries": [user_entry, sys_entry],
            "sentiment": sentiment,
        }))
    return {"audio_path": None, "user_text": user_text, "ai_text": ai_text,
            "sentiment": sentiment, "complaint": None}