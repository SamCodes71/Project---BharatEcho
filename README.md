# 🇮🇳 BharatEcho — AI-Powered Citizen Services Platform

> *Bridging the gap between India's 1.4 billion citizens and government services through voice, intelligence, and language.*

---

## What Is BharatEcho?

BharatEcho is a full-stack AI calling agent and civic intelligence dashboard built for Indian local government. Citizens call a phone number, speak their grievance in **Hindi or English**, and the system automatically transcribes the call, understands the intent, extracts structured complaint details, registers the complaint in a database, and generates a spoken confirmation — all without a human operator.

On the other side, government officers use a real-time web dashboard to monitor live calls, manage complaints through their lifecycle, dispatch outbound feedback surveys, and analyse sentiment and resolution trends across their municipality.

---

## Key Features

| Feature | Description |
|---|---|
| 📞 **Voice Call Agent** | Citizens call via Twilio. The AI handles the full conversation end-to-end — greeting, data collection, confirmation, registration. |
| 🎙️ **Multilingual STT** | OpenAI Whisper (base model) with two-pass language detection. Returns Devanagari Hindi or English — no romanisation. |
| 🔊 **Multilingual TTS** | Google Text-to-Speech (gTTS) responds in the caller's detected language — native Hindi audio for Hindi speakers. |
| 🧠 **State-Machine Pipeline** | A deterministic 5-stage conversation state machine (`idle → collecting → confirming → registered → general`). The LLM is only used as a last-resort fallback for genuinely open-ended questions. |
| 📋 **Complaint Management** | Full CRUD for complaints with status tracking (Pending → In Progress → Resolved → Escalated), priority levels, department assignment, and sentiment tags. |
| 📊 **Real-Time Dashboard** | WebSocket-powered React dashboard. Live call transcripts, complaint feeds, analytics charts, and notification centre update without page refresh. |
| 🌐 **Bilingual UI** | The entire dashboard switches between English and Hindi (Devanagari) instantly. Persisted via localStorage and backend settings. |
| 📣 **Outbound Feedback Calls** | When a complaint is resolved, the system automatically places an outbound Twilio call to the citizen to collect a 1–5 star rating via keypress. |
| 📝 **Survey Engine** | Officers create multi-question surveys targeting government departments, schemes, or the general public. Citizens can respond; results are aggregated live. |
| 🔔 **Notification Centre** | Every system event (new complaint, feedback received, survey created) generates a dashboard notification. |
| 🗄️ **SQLite + WAL** | All data lives in a single `bharatecho.db` file with WAL-mode SQLite for concurrent read/write access from async FastAPI threads. |

---

## Project Structure

```
ai-calling-agent/
│
├── backend/
│   ├── main.py                  # FastAPI app, all REST endpoints, WebSocket
│   ├── config.py                # Env vars: BASE_URL, Twilio creds, paths
│   ├── requirements.txt
│   ├── bharatecho.db            # SQLite database (auto-created)
│   │
│   ├── routes/
│   │   ├── call.py              # Twilio webhook handlers (inbound, outbound, feedback)
│   │   ├── ai.py                # /ai/chat (voice) and /ai/text endpoints
│   │   └── data_base.py         # All DB access: calls, complaints, feedback, surveys, notifications
│   │
│   └── services/
│       ├── stt.py               # Whisper STT — two-pass language detection + Devanagari output
│       ├── tts.py               # gTTS — language-aware speech synthesis
│       ├── pipeline.py          # Core state machine: intent, extraction, response, registration
│       ├── conversation_state.py # Per-call state dataclass + in-memory registry
│       ├── extractor.py         # LLM + keyword field extractor (name, location, description, category)
│       ├── llm.py               # Ollama/gemma3:1b wrapper — last-resort fallback only
│       ├── knowledge.py         # Scripted P_DATA (dept contacts) and SCHEMES info
│       └── translator.py        # LLM-based translation utility (experimental)
│
└── frontend/
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── app/
        │   ├── App.tsx                        # Root — wraps LanguageProvider + RealtimeProvider
        │   ├── routes.tsx                     # react-router v7 config
        │   ├── components/
        │   │   ├── dashboard-layout.tsx       # Sidebar nav + header + language toggle
        │   │   ├── live-call-interface.tsx    # Real-time call transcript viewer
        │   │   └── text-chat.tsx              # Typed chat interface for testing
        │   └── pages/
        │       ├── overview.tsx               # Live stats, charts, active calls
        │       ├── complaints.tsx             # Full CRUD complaint table
        │       ├── calls.tsx                  # Inbound/outbound call records
        │       ├── feedback.tsx               # Feedback management + star ratings
        │       ├── surveys.tsx                # Survey builder and response viewer
        │       ├── analytics.tsx              # Call trends, sentiment, resolution time
        │       ├── notifications.tsx          # System notification centre
        │       └── settings.tsx              # All system settings including UI language
        └── lib/
            ├── RealtimeContext.tsx            # Singleton WebSocket context
            ├── LanguageContext.tsx            # UI language context (en/hi)
            ├── i18n.ts                        # All translation strings
            ├── api.ts                         # API re-exports (compat shim)
            ├── fetch.ts                       # Fetch wrapper with ngrok header
            └── useRealtimeData.ts             # WebSocket data hook + types
```

---

## Technology Stack

### Backend
| Layer | Technology |
|---|---|
| API Framework | FastAPI + Uvicorn |
| Speech-to-Text | OpenAI Whisper (`base` model, multilingual) |
| Text-to-Speech | Google TTS (gTTS) |
| LLM (fallback only) | Ollama + `gemma3:1b` (local, no API key) |
| Telephony | Twilio Voice + TwiML |
| Database | SQLite 3 (WAL mode, thread-local connections) |
| Tunnelling (dev) | ngrok |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS v4 |
| Component Library | shadcn/ui (Radix UI primitives) |
| Charts | Recharts |
| Routing | React Router v7 |
| Real-time | Native WebSocket |

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.ai) running locally with `gemma3:1b` pulled
- A Twilio account with a phone number
- ffmpeg (for Whisper audio processing)
- ngrok (for local development webhooks)

### 1. Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Pull the local LLM
ollama pull gemma3:1b
```

Create a `.env` file (or export these variables):

```bash
BASE_URL=https://your-ngrok-subdomain.ngrok-free.app
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE=+1xxxxxxxxxx
WHISPER_MODEL=base          # or "small" for better accuracy
OLLAMA_MODEL=gemma3:1b
```

Start the server:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend Setup

```bash
cd frontend
npm install

# Create .env.local
echo "VITE_API_URL=http://localhost:8000" > .env.local
echo "VITE_WS_URL=ws://localhost:8000/ws/dashboard" >> .env.local

npm run dev
```

Open `http://localhost:5173`

### 3. Configure Twilio Webhooks

In your Twilio console, set the webhook URL for your phone number:

```
Voice → A call comes in:
  POST  https://your-ngrok.ngrok-free.app/incoming-call

Status Callback:
  POST  https://your-ngrok.ngrok-free.app/call-status
```

---

## How a Call Works (Step by Step)

```
Citizen dials Twilio number
        │
        ▼
Twilio → POST /incoming-call
        │  FastAPI creates call record, broadcasts to dashboard
        │  Plays greeting via TTS, starts 15s recording
        │
Citizen speaks (in Hindi or English)
        │
        ▼
Twilio → POST /process-recording
        │  Downloads audio MP3
        │
        ▼
stt.py  → Two-pass Whisper:
        │  Pass 1: detect_language() on first 30s
        │  Pass 2: transcribe(language="hi" or "en")
        │  Returns: { text, language, lang_code }
        │
        ▼
pipeline.py  → State machine:
        │  Stage "idle":      detect intent (complaint/scheme/survey/general)
        │  Stage "collecting": extract_fields() → fill name, location, description
        │  Stage "confirming": read back details, await yes/no
        │  Stage "registered": complaint saved, broadcast to dashboard
        │
        ▼
tts.py  → gTTS(text, lang=lang_code)
        │  Saves MP3 to /static/, returns public URL
        │
        ▼
Twilio → plays audio to citizen
        │  Records next utterance, loops back to /process-recording
        │
        ▼ (after call ends)
Twilio → POST /call-status
        │  db.end_call() → broadcasts "call_ended"
        │  If complaint resolved → auto-schedule feedback call
```

---

## Conversation State Machine

The pipeline uses a strict 5-stage state machine per call. The LLM **never** speaks during the `collecting` or `confirming` stages — only deterministic scripted responses are used, preventing hallucination in high-stakes data collection.

```
idle
 │  (user speaks)
 ├── intent = complaint  → collecting
 ├── intent = scheme     → general (scripted answer)
 ├── intent = survey     → general (scripted answer)
 └── intent = general    → general (keyword → LLM fallback)

collecting
 │  (extract name / location / description per turn)
 └── all fields filled   → confirming

confirming
 │  (read back details)
 ├── user says yes       → registered  (complaint saved to DB)
 └── user says no        → collecting  (re-ask missing fields)

registered
 └── any further speech  → general (LLM answers post-registration questions)

general
 └── re-intent check each turn (user may pivot to filing a complaint at any point)
```

---

## API Reference

### Telephony (Twilio webhooks)
| Method | Path | Description |
|---|---|---|
| POST | `/incoming-call` | Twilio webhook for incoming voice calls |
| POST | `/process-recording` | Processes each recorded utterance |
| POST | `/call-status` | Twilio call lifecycle events |
| POST | `/outbound` | TwiML for outbound follow-up calls |
| POST | `/feedback-call` | TwiML for automated feedback collection |
| POST | `/feedback-response` | Captures keypress rating from feedback call |

### Voice / Text AI
| Method | Path | Description |
|---|---|---|
| POST | `/ai/chat` | Audio file → STT → pipeline → TTS audio URL |
| POST | `/ai/text` | Text → pipeline → text response (no TTS) |

### REST API
| Method | Path | Description |
|---|---|---|
| GET | `/api/stats` | Dashboard summary stats |
| GET/POST | `/api/complaints` | List / create complaints |
| PATCH/DELETE | `/api/complaints/{id}` | Update / delete a complaint |
| GET/POST | `/api/feedback` | List stats / create feedback request |
| POST | `/api/feedback/{id}/complete` | Record a rating |
| GET/POST | `/api/surveys` | List stats / create survey |
| POST | `/api/surveys/{id}/respond` | Submit a survey response |
| POST | `/api/surveys/{id}/close` | Close a survey |
| GET/POST | `/api/notifications` | List / mark-read notifications |
| GET/POST | `/api/settings` | Read / update system settings |
| GET | `/api/analytics` | Full analytics dataset |

### WebSocket
| Path | Description |
|---|---|
| `/ws/dashboard` | Live dashboard updates (stats, calls, transcripts, complaints) |
| `/ws/voice` | Browser-based voice channel (sends WAV bytes, receives MP3 bytes) |

---

## Database Schema

All tables live in `bharatecho.db`.

| Table | Purpose |
|---|---|
| `calls` | Every call — inbound and outbound, with sentiment, language, duration |
| `complaints` | Registered grievances with status, priority, department, resolution timestamp |
| `transcripts` | Per-turn utterances for every call |
| `feedback` | Feedback requests linked to complaints; stores rating, comment, completion timestamp |
| `surveys` | Survey definitions with questions (JSON) |
| `survey_responses` | Individual responses (answers JSON) |
| `notifications` | System notifications with kind, ref_id, read status |
| `settings` | Key-value store for all system configuration |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | — | Public HTTPS base URL (ngrok in dev, domain in prod) |
| `TWILIO_ACCOUNT_SID` | — | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | — | Twilio auth token |
| `TWILIO_PHONE` | — | Twilio phone number |
| `WHISPER_MODEL` | `base` | Whisper model size (`tiny`, `base`, `small`, `medium`) |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API base URL |
| `OLLAMA_MODEL` | `gemma3:1b` | LLM model for fallback responses and extraction |
| `VITE_API_URL` | `http://localhost:8000` | Frontend → backend HTTP base URL |
| `VITE_WS_URL` | `ws://localhost:8000/ws/dashboard` | Frontend WebSocket URL |

---

## Language Support

### Voice Agent (STT + Pipeline + TTS)
- **English** — full support, default
- **Hindi** — full Devanagari support: Whisper outputs native Hindi script, all pipeline responses are written in Devanagari, gTTS speaks native Hindi audio
- **Detection** — automatic per utterance; the pipeline follows the caller if they switch language mid-call
- **Other Indian languages** — Whisper detects and transcribes (Telugu, Tamil, Bengali, Gujarati, Marathi, Kannada, Punjabi, Urdu); responses remain in English

### Dashboard UI
- **English** — default
- **Hindi (हिन्दी)** — all navigation labels, page headings, stat cards, buttons, and empty states
- **Toggle** — one-click switcher in the header; also selectable in Settings → Language → Dashboard Language
- **Persistence** — saved to `localStorage` and backend `settings.ui_language`

---

## Known Limitations

- The LLM (`gemma3:1b`) is a 1-billion parameter model and occasionally produces poor field extractions for complex utterances. The keyword fallback (`_keyword_extract`) compensates for most cases.
- Whisper `base` model is reasonably fast on CPU but may mis-transcribe heavily accented speech or background noise. Use `small` or `medium` for production.
- State is in-memory — restarting the server loses all active conversation states (calls in progress will restart from `idle` on the next utterance).
- The SQLite WAL setup works well for a single-server deployment but should be replaced with PostgreSQL for multi-instance horizontal scaling.

---

## License

MIT — see `LICENSE` for details.

---

*Built with ❤️ for Digital India*
