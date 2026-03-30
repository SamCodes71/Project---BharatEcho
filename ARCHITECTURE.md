# BharatEcho — System Architecture

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Component Map](#component-map)
3. [Voice Call Flow](#voice-call-flow)
4. [Conversation State Machine](#conversation-state-machine)
5. [NLP Pipeline](#nlp-pipeline)
6. [Data Layer](#data-layer)
7. [Real-Time Dashboard](#real-time-dashboard)
8. [Language Architecture](#language-architecture)
9. [Outbound Call Flow](#outbound-call-flow)
10. [Design Decisions & Trade-offs](#design-decisions--trade-offs)

---

## High-Level Overview

BharatEcho is structured as three loosely coupled layers communicating over well-defined interfaces:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CITIZEN LAYER                              │
│                                                                     │
│   📞 Phone Call          🌐 Web Browser          📱 Text Chat       │
│  (Twilio PSTN)         (React Dashboard)       (HTTP endpoint)     │
└────────┬───────────────────────┬──────────────────────┬────────────┘
         │ TwiML webhooks        │ REST + WebSocket      │ POST /ai/text
         │ (HTTPS POST)          │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API LAYER                                   │
│                                                                     │
│   FastAPI (Uvicorn)                                                 │
│   ├── routes/call.py      ← Twilio webhook handlers                │
│   ├── routes/ai.py        ← Audio/text AI endpoints                │
│   └── main.py             ← REST CRUD + WebSocket                  │
└────────┬────────────────────────────────────────────────────────────┘
         │ function calls
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       INTELLIGENCE LAYER                            │
│                                                                     │
│   stt.py          tts.py         pipeline.py      extractor.py     │
│  (Whisper)       (gTTS)        (State machine)  (LLM + keywords)  │
│                                                                     │
│   llm.py              conversation_state.py      knowledge.py      │
│  (Ollama/gemma)       (In-memory registry)       (Scripted data)   │
└────────┬────────────────────────────────────────────────────────────┘
         │ reads / writes
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                  │
│                                                                     │
│   SQLite (WAL mode)   bharatecho.db                                │
│   calls │ complaints │ transcripts │ feedback │ surveys │ settings  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Map

```
backend/
│
├── main.py ──────────────────────────────────────────────────────────
│   FastAPI application root. Declares all REST endpoints, the
│   WebSocket handler, and mounts static file serving.
│   Delegates telephony to routes/call.py and AI to routes/ai.py.
│
├── config.py ────────────────────────────────────────────────────────
│   Environment variable reading only. No logic.
│   Exports: BASE_URL, TWILIO_*, STATIC_DIR, TEMP_DIR
│
├── routes/
│   ├── call.py ──────────────────────────────────────────────────────
│   │   All Twilio-facing webhook endpoints.
│   │   Key functions:
│   │     incoming_call()     → greet + start recording
│   │     process_recording() → download audio → run_pipeline()
│   │     call_status()       → update DB when call ends
│   │     make_feedback_call()→ places outbound rating call
│   │
│   ├── ai.py ────────────────────────────────────────────────────────
│   │   Browser-facing AI endpoints.
│   │     POST /ai/chat  → audio file → pipeline → TTS URL
│   │     POST /ai/text  → typed text → pipeline → text response
│   │
│   └── data_base.py ─────────────────────────────────────────────────
│       SQLite abstraction layer.
│       Proxy classes (_CallsProxy, _ComplaintsProxy, etc.) make
│       SQLite tables look like in-memory lists to callers.
│       Thread-local connections + WAL mode for concurrency.
│       WebSocket registry and broadcast() live here.
│
└── services/
    ├── stt.py ───────────────────────────────────────────────────────
    │   Two-pass Whisper STT.
    │   Pass 1: detect_language() on 30s mel-spectrogram
    │   Pass 2: transcribe(language=detected) for accuracy
    │   Hindi → Devanagari Unicode output (not romanised)
    │
    ├── tts.py ───────────────────────────────────────────────────────
    │   gTTS wrapper. Accepts lang_code ("en", "hi", etc.)
    │   Saves MP3 to /static/, waits for file lock, returns URL.
    │
    ├── pipeline.py ──────────────────────────────────────────────────
    │   The core brain. Two entry points:
    │     run_pipeline(audio_path, call_id)  → voice flow
    │     run_pipeline_text(text, call_id)   → text flow
    │   Both use _run_state_machine() internally.
    │   State machine stages: idle/collecting/confirming/registered/general
    │   LLM is NEVER called in collecting or confirming stages.
    │
    ├── conversation_state.py ────────────────────────────────────────
    │   ConversationState dataclass:
    │     - stage, intent, category, language, lang_code
    │     - citizen_name, location, description (fields being collected)
    │     - history (last 10 turns for LLM context)
    │   In-memory dict keyed by call_id.
    │
    ├── extractor.py ─────────────────────────────────────────────────
    │   Two-tier extraction:
    │   Tier 1 (fast): keyword matching for short responses (≤2 words)
    │   Tier 2 (LLM):  Ollama prompt for longer utterances
    │   Extracts: name, location, description, category
    │   Handles Devanagari keywords natively (बिजली, पानी, etc.)
    │
    ├── llm.py ───────────────────────────────────────────────────────
    │   Ollama HTTP client wrapper.
    │   Hard constraints: 60 token limit, 0.1 temperature, 1-sentence cap.
    │   Hallucination validator: rejects markdown, bullet points,
    │   leaked prompts, multi-paragraph responses.
    │   Returns safe fallback if validation fails.
    │
    └── knowledge.py ─────────────────────────────────────────────────
        Static knowledge base.
        P_DATA: department contact info per category
        SCHEMES: government scheme descriptions
        Used by pipeline before calling LLM.
```

---

## Voice Call Flow

This is the most critical path in the system. Every arrow represents a real HTTP request or function call.

```
                        CITIZEN
                           │
                    dials phone number
                           │
                           ▼
                    ┌─────────────┐
                    │   TWILIO    │
                    │  PSTN/Cloud │
                    └──────┬──────┘
                           │  POST /incoming-call
                           │  body: From=+91XXXXXXXXXX
                           ▼
                    ┌─────────────────────────────┐
                    │  routes/call.py              │
                    │  incoming_call()             │
                    │  1. db.create_call()         │
                    │  2. broadcast("call_started")│
                    │  3. return TwiML: <Say>+<Record>│
                    └──────┬──────────────────────┘
                           │  TwiML response
                           ▼
                    TWILIO plays greeting audio
                    TWILIO records up to 15s
                           │
                    citizen speaks
                           │
                           ▼
                    ┌─────────────────────────────┐
                    │  TWILIO records audio        │
                    │  → uploads to Twilio CDN     │
                    │  → POST /process-recording   │
                    │    ?call_id=CALL-IN-XXXXXX   │
                    │    body: RecordingUrl=https://│
                    └──────┬──────────────────────┘
                           │
                           ▼
                    ┌─────────────────────────────┐
                    │  routes/call.py              │
                    │  process_recording()         │
                    │  1. httpx.get(recording_url) │ ← downloads MP3
                    │  2. saves to /temp/uuid.mp3  │
                    │  3. run_pipeline(tmp, call_id)│
                    └──────┬──────────────────────┘
                           │
                           ▼
                    ┌─────────────────────────────┐
                    │  services/pipeline.py        │
                    │  run_pipeline()              │
                    │                             │
                    │  ① stt.transcribe()         │
                    │     → detect language        │
                    │     → transcribe audio       │
                    │     → returns {text, lang}   │
                    │                             │
                    │  ② cs.get_or_create(call_id)│
                    │     → load/init call state  │
                    │                             │
                    │  ③ _run_state_machine()     │
                    │     → see State Machine below│
                    │                             │
                    │  ④ tts.text_to_speech()     │
                    │     → saves MP3              │
                    │     → returns public URL     │
                    └──────┬──────────────────────┘
                           │  result["audio_path"]
                           ▼
                    ┌─────────────────────────────┐
                    │  routes/call.py              │
                    │  process_recording()         │
                    │  → return TwiML:             │
                    │    <Play>{audio_url}</Play>  │
                    │    <Record>...next turn</Record>│
                    └──────┬──────────────────────┘
                           │
                           ▼
                    TWILIO plays AI response audio
                    TWILIO records next utterance
                    (loop continues until hangup)
                           │
                    citizen hangs up
                           │
                           ▼
                    TWILIO → POST /call-status
                    db.end_call() → broadcast("call_ended")
```

---

## Conversation State Machine

The state machine is the most carefully designed component. It is **deterministic for the critical data-collection phases** — the LLM is never trusted with structured data extraction during `collecting` or `confirming` stages.

```
┌───────────────────────────────────────────────────────────────────┐
│                     ConversationState                             │
│  stage: idle | collecting | confirming | registered | general     │
│  citizen_name: str | None                                         │
│  location:     str | None                                         │
│  description:  str | None                                         │
│  category:     str | None                                         │
│  lang_code:    "en" | "hi" | ...                                  │
└───────────────────────────────────────────────────────────────────┘

                         ┌───────┐
                         │ IDLE  │◄────────── new call starts here
                         └───┬───┘
                             │
              detect_initial_intent(text)
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                   │
          ▼                  ▼                   ▼
     "complaint"          "scheme"           "general"
          │              "survey"                │
          ▼                  │                   ▼
  ┌────────────┐       scripted answer     ┌──────────┐
  │ COLLECTING │◄────────────┘             │ GENERAL  │
  └─────┬──────┘                           └─────┬────┘
        │                                        │
        │  each turn:                            │ re-check intent each turn
        │  extract_fields(text)                  │ (user can pivot to complaint)
        │  _apply_extracted(state, fields)        │
        │                                        │
        │  ask for next missing field             │
        │  (scripted — NO LLM)                   │
        │                                        │
        │  all fields filled?                    │
        ▼                                        │
  ┌─────────────┐                                │
  │ CONFIRMING  │                                │
  └──────┬──────┘                                │
         │                                       │
         │  read back: name / location /          │
         │  description / department              │
         │  (scripted — NO LLM)                  │
         │                                       │
    is_confirmation(text)?                       │
         │                                       │
    ┌────┴────┐                                  │
    │yes      │no (correction)                   │
    ▼         ▼                                  │
┌──────────┐  re-extract corrected fields        │
│REGISTERED│  back to COLLECTING                 │
└────┬─────┘                                     │
     │                                           │
     │  db.create_complaint()                    │
     │  broadcast("new_complaint")               │
     │  broadcast("stats_update")               │
     │                                           │
     └──── any further speech ──► GENERAL ───────┘
                                      │
                              keyword_answer() → scripted
                              or LLM fallback (last resort)
```

### Why No LLM in collecting/confirming?

The LLM (`gemma3:1b`) is a 1B parameter model running locally. At this scale, models are unreliable for anything requiring consistent JSON output or structured turns. Even larger models hallucinate under conversational pressure. The solution is **not** to use the LLM for structured collection at all — only the keyword extractor and deterministic scripted prompts handle those stages.

The LLM is only invoked when:
1. The user asks a genuinely open-ended question (e.g., "what is PM Kisan?")
2. The scripted keyword router finds no match
3. The stage is `general` or `registered`

---

## NLP Pipeline

```
User utterance (text string, may be Devanagari or Latin)
         │
         ▼
┌────────────────────────────────────────────────────────┐
│  detect_initial_intent()          (keyword matching)   │
│  Input: raw text                                       │
│  Keywords: English + Hindi (Devanagari)                │
│  Output: "complaint" | "scheme" | "survey" | "general" │
└──────────────────────────┬─────────────────────────────┘
                           │  if "complaint" during collecting:
                           ▼
┌────────────────────────────────────────────────────────┐
│  extract_fields()                                      │
│                                                        │
│  if len(text) ≤ 2 words:                              │
│    └── _keyword_extract()   ← fast, no LLM            │
│        Checks: बिजली/bijli → electricity              │
│               पानी/paani  → water                     │
│               सड़क/sadak  → road                      │
│               कचरा/kachra → sanitation                │
│               digits/location words → location        │
│               1-3 capitalised words → name            │
│                                                        │
│  else:                                                 │
│    └── LLM prompt (EXTRACT_PROMPT)                     │
│        Two examples: English + Devanagari Hindi        │
│        Response: JSON {name, location, desc, category} │
│        Parse → JSON → fallback to _keyword_extract     │
│                       if JSON fails                    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│  _apply_extracted(state, fields, raw_text)             │
│  Never overwrites already-filled fields.               │
│  Priority: description > location > name               │
│  Name validation: rejects non-name words, max 3 words  │
│  Category validation: keyword-based override of LLM   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
                    state.citizen_name
                    state.location
                    state.description
                    state.category
```

---

## Data Layer

All data is stored in a single SQLite file (`bharatecho.db`) with WAL journal mode for concurrent reads.

```
┌─────────────────────────────────────────────────────────────────┐
│  data_base.py  —  SQLite abstraction                            │
│                                                                 │
│  Thread safety: threading.local() connection per thread         │
│  Concurrency:  WAL mode (writers don't block readers)           │
│  Proxy classes: make tables look like Python lists              │
└─────────────────────────────────────────────────────────────────┘

bharatecho.db

calls
├── id           TEXT PK   "CALL-IN-ABC123"
├── phone        TEXT      "+91XXXXXXXXXX"
├── direction    TEXT      "inbound" | "outbound"
├── status       TEXT      "active" | "completed"
├── sentiment    TEXT      "Positive" | "Neutral" | "Negative" | "Angry"
├── language     TEXT      "Hindi" | "English"
├── started_at   TEXT      ISO-8601
├── ended_at     TEXT      ISO-8601 | NULL
├── duration     TEXT      "2m 34s" | NULL
└── complaint_id TEXT      FK → complaints.id | NULL

complaints
├── id           TEXT PK   "CMP-2026-A4F2"
├── call_id      TEXT      FK → calls.id
├── citizen      TEXT      "Ramesh Kumar"
├── phone        TEXT
├── category     TEXT      "electricity" | "water" | "road" | "sanitation" | "general"
├── issue        TEXT      full description
├── department   TEXT      "Electricity Board" | ...
├── assigned_to  TEXT
├── status       TEXT      "Pending" | "In Progress" | "Resolved" | "Escalated"
├── priority     TEXT      "Low" | "Medium" | "High" | "Critical"
├── sentiment    TEXT
├── language     TEXT
├── created_at   TEXT
├── follow_up_date TEXT
└── resolved_at  TEXT | NULL

transcripts
├── id           INT PK AUTOINCREMENT
├── call_id      TEXT
├── speaker      TEXT      "user" | "system"
├── text         TEXT
└── ts           TEXT

feedback
├── id           TEXT PK   "FB-A1B2C3"
├── complaint_id TEXT
├── service      TEXT
├── citizen      TEXT
├── phone        TEXT
├── status       TEXT      "pending" | "completed"
├── rating       INT       1-5 | NULL
├── comment      TEXT
├── created_at   TEXT
└── completed_at TEXT | NULL

surveys
├── id           TEXT PK   "SRV-XYZ123"
├── title        TEXT
├── target       TEXT      "department" | "scheme" | "general"
├── target_name  TEXT
├── questions    TEXT      JSON array
├── status       TEXT      "active" | "closed"
└── response_count INT

survey_responses
├── id           TEXT PK
├── survey_id    TEXT
├── respondent   TEXT
├── answers      TEXT      JSON array
└── submitted_at TEXT

notifications
├── id           TEXT PK
├── title        TEXT
├── message      TEXT
├── kind         TEXT      "complaint" | "survey" | "call" | "system"
├── ref_id       TEXT
├── read         INT       0 | 1
└── created_at   TEXT

settings
├── key          TEXT PK
└── value        TEXT      JSON-encoded value
```

### Proxy Pattern

The DB layer uses a proxy pattern so the rest of the codebase treats `db.calls_db` like a Python list while actually reading from SQLite:

```python
class _CallsProxy:
    def __iter__(self):
        with _conn() as db:
            rows = db.execute("SELECT * FROM calls ORDER BY started_at ASC").fetchall()
        return iter([_LiveCallDict(_row_to_dict(r)) for r in rows])

    def __len__(self): ...
    def append(self, item): pass  # no-op — writes go through create_call()
```

`_LiveCallDict` is a dict subclass that writes mutations back to SQLite immediately:
```python
class _LiveCallDict(dict):
    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        if key in ("complaint_id", "sentiment", "status", ...):
            db.execute(f"UPDATE calls SET {key}=? WHERE id=?", (value, call_id))
```

This means `c["sentiment"] = "Angry"` in pipeline.py transparently persists without any additional DB call.

---

## Real-Time Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER  (React + RealtimeContext)                          │
│                                                              │
│  Single WebSocket connection per browser tab.                │
│  RealtimeContext wraps the app root — all pages share        │
│  one WS connection via React Context.                        │
│                                                              │
│  Events consumed:                                            │
│    stats_update    → overview stats cards, charts            │
│    call_started    → live call panel appears                 │
│    call_ended      → live call panel disappears              │
│    transcript_update → transcript lines appear in real-time  │
│    new_complaint   → complaint count badge updates           │
└──────────────────┬───────────────────────────────────────────┘
                   │  ws://host/ws/dashboard
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  FastAPI WebSocket handler  (main.py)                        │
│                                                              │
│  On connect:                                                 │
│    1. db.register_ws(websocket)                              │
│    2. send stats_update (initial state)                      │
│    3. send call_started if there's an active call            │
│                                                              │
│  On disconnect:                                              │
│    db.unregister_ws(websocket)                               │
│                                                              │
│  Ping loop: client sends "ping" every 20s to keep alive     │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  data_base.broadcast(event, data)                            │
│                                                              │
│  Iterates _ws_clients list.                                  │
│  Sends JSON: {"event": event, "data": data}                  │
│  Removes dead connections automatically.                     │
│                                                              │
│  Called from:                                                │
│    incoming_call()       → "call_started"                    │
│    process_recording()   → "transcript_update"               │
│    call_status()         → "call_ended", "stats_update"      │
│    create_complaint()    → "new_complaint"                   │
│    update_complaint()    → "stats_update"                    │
└──────────────────────────────────────────────────────────────┘
```

### The asyncio Bridge Problem

FastAPI's WebSocket broadcast is a coroutine (`async def broadcast()`), but `run_pipeline()` is called from synchronous Twilio webhook handlers via Starlette's `run_in_threadpool`. Calling `asyncio.run()` from inside a running event loop raises `RuntimeError`.

The fix uses `_fire_and_forget()`:

```python
def _fire_and_forget(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(coro)   # schedules on existing loop
        else:
            loop.run_until_complete(coro)
    except RuntimeError:
        asyncio.run(coro)            # fallback: Twilio thread has no loop
```

`create_task()` schedules the coroutine on the running event loop from the thread pool worker — the broadcast fires after the HTTP response is returned.

---

## Language Architecture

```
CITIZEN SPEECH (phone)
        │
        ▼
stt.py  Pass 1: whisper.detect_language()
        │  → returns {"hi": 0.94, "en": 0.03, ...}
        │  → picks argmax
        │
        ├── "hi" detected:
        │     Pass 2: whisper.transcribe(language="hi")
        │     Output: Devanagari Unicode
        │     e.g. "मेरा नाम रमेश है, सेक्टर 5 में बिजली नहीं है"
        │
        └── "en" detected:
              Pass 2: whisper.transcribe(language="en")
              Output: Latin text
              e.g. "My name is Ramesh, no electricity in Sector 5"
              │
              ▼
pipeline.py  state.lang_code = "hi" | "en"
        │
        │  all response strings selected by lang_code:
        │
        ├── _ask_next(state)          → Hindi or English prompt
        ├── _confirmation_prompt(state) → Hindi or English summary
        ├── _keyword_answer(text, lang) → Hindi or English scripted answer
        └── complaint registered message → Hindi or English
              │
              ▼
tts.py  gTTS(text=response, lang=lang_code)
        │  → "hi": speaks Devanagari as native Hindi audio
        │  → "en": speaks English
        │
        └── MP3 saved → URL returned → Twilio plays to citizen

DASHBOARD UI
        │
        ▼
LanguageContext.tsx
        │  lang: "en" | "hi"
        │  persisted: localStorage + backend settings.ui_language
        │
        ▼
i18n.ts  t("nav_complaints") → "Complaints" | "शिकायतें"
         t("status_pending") → "Pending"     | "लंबित"
         (80+ keys covering all visible UI strings)
        │
        ▼
All pages consume useLang() hook → instant re-render on language switch
Header toggle button switches in one click
Settings page → "Dashboard Language" dropdown saves to backend
```

---

## Outbound Call Flow

```
Complaint resolved
        │
        ▼
main.py PATCH /api/complaints/{id}
  status → "Resolved"
        │
        ▼
db.resolve_complaint()     sets resolved_at timestamp
        │
  survey_after_resolution setting == True?
        │
        ▼
db.create_feedback()       creates pending feedback record
        │
  phone number valid?
        │
        ▼
make_feedback_call(to_number, citizen_name, feedback_id, complaint_id)
        │
        ▼
Twilio REST API: calls.create(
  to=citizen_phone,
  url=BASE_URL/feedback-call?...params
)
        │
        ▼
Twilio dials citizen
Citizen picks up
        │
        ▼
POST /feedback-call
  → TwiML: <Say> rating prompt </Say>
  → <Gather numDigits=1 action=/feedback-response>
        │
Citizen presses 1-5
        │
        ▼
POST /feedback-response
  → db.complete_feedback(feedback_id, rating=int(digit))
  → db.add_notification("Feedback Received", ...)
  → TwiML: <Say> thank you message </Say> <Hangup/>
```

---

## Design Decisions & Trade-offs

### 1. Local LLM vs Cloud LLM

**Choice:** Ollama + `gemma3:1b` running locally.

**Why:** Government data privacy requirements. No citizen complaint data (names, locations, grievances) should leave the local network. Cloud LLMs would require sending all transcribed speech to external APIs.

**Trade-off:** The 1B parameter model is significantly less capable than GPT-4 or Claude. It compensates through: heavy prompt engineering, strictly capped output (60 tokens, temperature 0.1), hallucination validation, and — most importantly — limiting LLM usage to only non-critical general conversation. Structured data collection uses only keyword matching.

### 2. SQLite vs PostgreSQL

**Choice:** SQLite with WAL mode.

**Why:** Zero infrastructure dependencies. The entire system runs from a single Python process with a single file database. Perfect for municipal deployments with limited IT capability.

**Trade-off:** Single-server only. For multi-instance horizontal scaling, migrate to PostgreSQL using the same schema.

### 3. State Machine vs LLM-Driven Conversation

**Choice:** Explicit 5-stage state machine for complaint collection; LLM only as a fallback for general Q&A.

**Why:** In a citizen services context, collecting accurate name/location/description is critical. An LLM-driven conversation can lose track of what it has and hasn't collected, accept partial information as complete, or get distracted by elaboration. The state machine is deterministic, testable, and auditable.

**Trade-off:** Less flexible conversation flow. The state machine cannot handle complex multi-intent utterances (e.g., "I have a water problem AND an electricity problem"). Each call handles one complaint — subsequent complaints require a new call.

### 4. Whisper `base` Model

**Choice:** `base` model (74M parameters) as default.

**Why:** Runs in real-time on CPU. The `base` model processes a 15-second audio clip in approximately 3-5 seconds on a modern CPU, keeping the round-trip latency (record → transcribe → respond → play) under 10 seconds.

**Trade-off:** Lower accuracy for heavy accents, noisy environments, and code-switching (mixing Hindi + English mid-sentence). The `small` or `medium` models provide meaningfully better Hindi accuracy but increase latency 2-4x.

### 5. Per-Turn Recording vs Continuous Stream

**Choice:** Twilio `<Record>` for per-turn recordings (15s max), rather than continuous WebSocket streaming.

**Why:** Whisper is not a streaming transcriber. It processes complete audio files. Per-turn recording provides clean complete utterances that Whisper handles well.

**Trade-off:** The 15-second limit per turn means very long descriptions may get cut off. The conversation loops back (`<Record>` after each `<Play>`) so citizens can continue in subsequent turns.
