# services/extractor.py
#
# Field extractor — supports English AND Hindi (Devanagari script).
#
# Fixes applied:
#   1. _is_valid_name: rejects names containing commas ("Samarth, Dubai")
#   2. _looks_like_location: recognises major Indian city names without suffixes
#   3. extract_name_direct: strips everything after the first comma before
#      validating, so "Samarth, Dubai." → "Samarth"
#   4. extract_correction / extract_fields: double-guarded — if LLM returns a
#      bare string instead of JSON, _parse_json returns None and we fall back
#      to _keyword_extract instead of crashing with 'str has no .get()'

import json
import re
import requests
import os

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434") + "/api/generate"
MODEL      = os.environ.get("OLLAMA_MODEL", "phi")


# ── Location-suffix words ─────────────────────────────────────────────────────
_LOCATION_SUFFIXES = {
    # English
    "nagar", "nagara", "colony", "sector", "ward", "area", "district",
    "city", "town", "village", "street", "road", "marg", "vihar", "puram",
    "enclave", "extension", "block", "phase", "plot", "chowk", "bazaar",
    "bazar", "ganj", "gunj", "pur", "puri", "abad", "khand", "kunj",
    # Hindi romanised
    "mohalla", "gaon", "tehsil",
    # Devanagari
    "नगर", "कॉलोनी", "वार्ड", "मोहल्ला", "गाँव", "क्षेत्र", "सेक्टर",
}

# FIX 2: Major Indian city names that _looks_like_location must catch even
# without a suffix word.  "Sector 17, Gurugram, Delhi" → location, not name.
_CITY_NAMES = {
    "delhi", "mumbai", "bangalore", "bengaluru", "gurugram", "gurgaon",
    "noida", "hyderabad", "pune", "chennai", "kolkata", "lucknow", "jaipur",
    "ahmedabad", "surat", "indore", "bhopal", "patna", "agra", "varanasi",
    "meerut", "faridabad", "ghaziabad", "amritsar", "chandigarh", "nagpur",
    "coimbatore", "visakhapatnam", "thane", "pimpri", "nashik", "vadodara",
}

# Words that are definitely NOT person names
_NOT_A_NAME = {
    "circuit", "short", "electric", "power", "water", "road", "issue",
    "problem", "complaint", "register", "yes", "no", "ok", "please",
    "sir", "madam", "hello", "hi", "namaste", "help", "urgent", "broken",
    "light", "pipe", "pothole", "garbage", "waste", "supply", "outage",
    "cut", "damage", "null", "none", "na", "n/a",
    # Hindi romanised
    "bijli", "pani", "sadak", "nali", "kachara", "samasya", "shikayat",
    "haan", "nahi", "theek", "karo", "mera",
}


def _sanitise(value) -> str | None:
    """Convert LLM junk outputs to None."""
    if value is None:
        return None
    s = str(value).strip()
    if s.lower() in ("null", "none", "na", "n/a", "undefined", "", "unknown"):
        return None
    return s


def _looks_like_location(text: str) -> bool:
    """Return True if text is more likely a place name than a person's name."""
    t_lower = text.lower()
    words = [w.strip(".,!?;:") for w in t_lower.split()]
    # Contains a digit → location (house no, sector no, ward no)
    if any(c.isdigit() for c in text):
        return True
    # Any word matches a known location suffix
    if any(w in _LOCATION_SUFFIXES for w in words):
        return True
    # Multi-word with location keywords anywhere inside
    en_loc = {"street", "road", "nagar", "colony", "sector", "area",
               "district", "city", "village", "ward", "mohalla", "chowk"}
    if any(kw in words for kw in en_loc):
        return True
    # FIX 2: Matches a known major city name
    if any(city in t_lower for city in _CITY_NAMES):
        return True
    return False


def _is_valid_name(name: str) -> bool:
    """Return True only if name looks like a real person's name."""
    if not name:
        return False
    name = name.strip()

    # FIX 1: A comma inside a name means it's "Name, City" — not a clean name.
    if "," in name:
        return False

    words = name.split()
    if not (1 <= len(words) <= 4 and len(name) < 60):
        return False
    if any(c.isdigit() for c in name):
        return False
    name_lower = name.lower()
    words_lower = [w.strip(".,!?;:") for w in name_lower.split()]
    if any(w in _NOT_A_NAME for w in words_lower):
        return False
    if _looks_like_location(name):
        return False
    if not any(c.isalpha() for c in name):
        return False
    return True


# ── Direct name extraction ────────────────────────────────────────────────────

_NAME_PREFIXES = [
    r"(?:my\s+name\s+is|i\s+am|i'm|this\s+is|name\s+is|call\s+me)\s+",
    r"(?:mera\s+naam\s+(?:hai\s+)?|mera\s+name\s+(?:hai\s+)?)\s*",
    r"(?:मेरा\s+नाम\s+(?:है\s+)?|मैं\s+हूँ?\s*)",
]


def extract_name_direct(text: str) -> str | None:
    """Strip 'my name is …' style prefixes and return the name portion."""
    cleaned = text.strip()
    for pat in _NAME_PREFIXES:
        cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE).strip()
    # Remove trailing "hai" / "है" / punctuation
    cleaned = re.sub(r"\s+(?:hai|h[ae]|है)\.?\s*$", "", cleaned, flags=re.IGNORECASE).strip()
    cleaned = cleaned.rstrip(".,!?;:")

    # FIX 1: STT often appends ", CityName" after the spoken name.
    # Strip everything from the first comma onwards before validating.
    if "," in cleaned:
        cleaned = cleaned.split(",")[0].strip()

    if cleaned and _is_valid_name(cleaned):
        return cleaned

    # If prefix stripping removed too much, try raw text (comma-stripped too)
    raw = text.strip().rstrip(".,!?;:")
    if "," in raw:
        raw = raw.split(",")[0].strip()
    if raw and _is_valid_name(raw):
        return raw

    return None


# ── Extraction prompts ────────────────────────────────────────────────────────

EXTRACT_PROMPT = (
    "Extract ONLY information explicitly stated in the message. "
    "Return a JSON object with keys: name, location, description, category.\n"
    "Rules:\n"
    "- name: person's first/last name only. Place names (Nagar, Colony, Sector, etc.) are NOT names.\n"
    "- location: area, colony, sector, ward, city, address. Place names ARE locations.\n"
    "- description: the problem or issue described.\n"
    "- category: one of electricity, water, road, sanitation, general.\n"
    "- Use JSON null (not the string 'null') for fields not mentioned.\n"
    "Return ONLY the JSON object. No explanation. No markdown.\n\n"
    "Example 1:\n"
    'Message: "My name is Ramesh, there is no water supply in Sector 5"\n'
    'Output: {"name":"Ramesh","location":"Sector 5","description":"no water supply","category":"water"}\n\n'
    "Example 2:\n"
    'Message: "I am having issues with the road in Suryadev Nagar"\n'
    'Output: {"name":null,"location":"Suryadev Nagar","description":"road has issues","category":"road"}\n\n'
    "Example 3:\n"
    'Message: "My name is Samarth"\n'
    'Output: {"name":"Samarth","location":null,"description":null,"category":null}\n\n'
    "Example 4 (Hindi):\n"
    'Message: "मेरा नाम सुरेश है, सेक्टर 12 में बिजली नहीं है"\n'
    'Output: {"name":"सुरेश","location":"सेक्टर 12","description":"बिजली नहीं है","category":"electricity"}\n\n'
    'Message: "<<TEXT>>"\n'
    "Output:"
)

CORRECTION_PROMPT = (
    "The user is correcting ONE field of their complaint registration.\n"
    "Extract ONLY the field being corrected. Return JSON with keys: name, location, description.\n"
    "Use JSON null for fields NOT being corrected in this message.\n"
    "Rules:\n"
    "- name: person's name only (not place names)\n"
    "- location: area, colony, sector, ward, address\n"
    "- description: the issue/problem description\n"
    "Return ONLY the JSON. No markdown.\n\n"
    "Example 1:\n"
    'Message: "My name is Samarth"\n'
    'Output: {"name":"Samarth","location":null,"description":null}\n\n'
    "Example 2:\n"
    'Message: "The location is Green Park Colony"\n'
    'Output: {"name":null,"location":"Green Park Colony","description":null}\n\n'
    "Example 3:\n"
    'Message: "The problem is road has many potholes"\n'
    'Output: {"name":null,"location":null,"description":"road has many potholes"}\n\n'
    'Message: "<<TEXT>>"\n'
    "Output:"
)


def _call_llm(prompt: str) -> str:
    resp = requests.post(
        OLLAMA_URL,
        json={
            "model":  MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.0,
                "num_predict": 150,
                "stop": ["\n\n", "Message:", "Example:"],
            },
        },
        timeout=5,
    )
    return resp.json().get("response", "").strip()


def _parse_json(raw: str) -> dict | None:
    """Parse JSON from LLM output. Returns None (never raises) on any failure."""
    raw = re.sub(r"```json|```", "", raw).strip()
    match = re.search(r'\{[^}]+\}', raw, re.DOTALL)
    if match:
        raw = match.group(0)
    try:
        result = json.loads(raw)
        # LLM occasionally returns a plain string instead of a dict
        if not isinstance(result, dict):
            return None
        return result
    except Exception:
        return None


def extract_fields(text: str) -> dict:
    """Full extraction — used during idle/collecting stages."""
    if not text or not text.strip():
        return {}

    if len(text.strip().split()) <= 2:
        return _keyword_extract(text)

    try:
        prompt = EXTRACT_PROMPT.replace("<<TEXT>>", text.replace('"', "'"))
        raw    = _call_llm(prompt)
        result = _parse_json(raw)
        if result:
            clean = {
                "name":        _sanitise(result.get("name")),
                "location":    _sanitise(result.get("location")),
                "description": _sanitise(result.get("description")),
                "category":    _sanitise(result.get("category")),
            }
            if clean["name"] and _looks_like_location(clean["name"]):
                if not clean["location"]:
                    clean["location"] = clean["name"]
                clean["name"] = None
            if clean["name"] and not _is_valid_name(clean["name"]):
                clean["name"] = None
            print(f"[EXTRACT] {clean}")
            return clean
    except Exception as e:
        print(f"Extractor error: {e}")

    return _keyword_extract(text)


def extract_correction(text: str) -> dict:
    """
    Targeted extraction for the confirming→no correction path.
    Always returns a dict — never raises, never returns a bare string.
    """
    if not text or not text.strip():
        return {}

    if len(text.strip().split()) <= 2:
        return _keyword_extract(text)

    try:
        prompt = CORRECTION_PROMPT.replace("<<TEXT>>", text.replace('"', "'"))
        raw    = _call_llm(prompt)
        result = _parse_json(raw)
        if result:
            clean = {
                "name":        _sanitise(result.get("name")),
                "location":    _sanitise(result.get("location")),
                "description": _sanitise(result.get("description")),
            }
            if clean["name"] and _looks_like_location(clean["name"]):
                if not clean["location"]:
                    clean["location"] = clean["name"]
                clean["name"] = None
            if clean["name"] and not _is_valid_name(clean["name"]):
                clean["name"] = None
            print(f"[CORRECTION] {clean}")
            return clean
    except Exception as e:
        print(f"Correction extractor error: {e}")

    return _keyword_extract(text)


def _keyword_extract(text: str) -> dict:
    """Pure keyword fallback for short or LLM-failed inputs."""
    t = text.lower().strip()
    result: dict = {"name": None, "location": None, "description": None, "category": None}

    if any(w in t for w in ["electric", "power", "light", "voltage", "wire",
                              "circuit", "transformer", "meter"]) or \
       any(w in text for w in ["बिजली", "विद्युत", "करंट", "बत्ती"]):
        result["category"] = "electricity"
    elif any(w in t for w in ["water", "pipe", "tap", "supply", "nali",
                                "naali", "drainage"]) or \
         any(w in text for w in ["पानी", "नल", "नाली", "जल"]):
        result["category"] = "water"
    elif any(w in t for w in ["road", "pothole", "street", "footpath", "sadak"]) or \
         any(w in text for w in ["सड़क", "रास्ता", "गड्ढा", "फुटपाथ"]):
        result["category"] = "road"
    elif any(w in t for w in ["garbage", "waste", "sanit", "toilet",
                                "sweeping", "dustbin"]) or \
         any(w in text for w in ["कचरा", "सफाई", "शौचालय", "गंदगी"]):
        result["category"] = "sanitation"

    if _looks_like_location(text):
        result["location"] = text.strip()
    elif _is_valid_name(text.strip()):
        result["name"] = text.strip()

    if result["category"] and not result["description"]:
        result["description"] = text.strip()

    return result


def is_confirmation(text: str) -> bool:
    """Accept yes/no in English and Hindi."""
    yes_words = [
        "yes", "correct", "right", "confirm", "ok", "okay", "sure", "proceed",
        "haan", "ha", "Ha", "theek", "sahi", "bilkul",
        "हाँ", "हां", "ठीक है", "सही", "बिल्कुल", "हाँ जी", "जी हाँ",
    ]
    no_words = [
        "no", "nope", "wrong", "incorrect", "change", "edit", "modify", "different",
        "nahi", "galat",
        "नहीं", "नही", "गलत", "बदलो", "बदलें",
    ]
    t = text.lower()
    yes_hit = any(w in t for w in yes_words) or any(w in text for w in yes_words)
    no_hit  = any(w in t for w in no_words)  or any(w in text for w in no_words)
    return yes_hit and not no_hit
