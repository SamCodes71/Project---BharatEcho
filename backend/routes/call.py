# routes/call.py
from fastapi import APIRouter, Request
from fastapi.responses import Response
from twilio.twiml.voice_response import VoiceResponse
from twilio.rest import Client
import httpx, uuid, os, asyncio

from backend.services.pipeline import run_pipeline
from backend.config import BASE_URL, TEMP_DIR, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE
from backend.routes import data_base as db

router = APIRouter()


# ── Startup guard ────────────────────────────────────────────────────────────
if not BASE_URL or not BASE_URL.startswith("http"):
    import sys
    print(f"[CONFIG ERROR] BASE_URL is invalid: {BASE_URL!r}", file=sys.stderr)
    print("[CONFIG ERROR] Set BASE_URL=https://your-ngrok-url in .env", file=sys.stderr)


# ── Incoming call ────────────────────────────────────────────────────────────

@router.post("/incoming-call")
async def incoming_call(request: Request):
    form   = await request.form()
    caller = form.get("From", "Unknown")

    call = db.create_call(phone=caller, direction="inbound")
    await db.broadcast("call_started", {"call": call, "transcript": []})

    response = VoiceResponse()
    response.say("Namaste. Welcome to BharatEcho citizen services. Please speak your query after the beep.")
    response.record(
        action=f"{BASE_URL}/process-recording?call_id={call['id']}",
        method="POST",
        max_length=15,
        play_beep=True,
    )
    print(f"[TWIML incoming] call_id={call['id']} record_action={BASE_URL}/process-recording?call_id={call['id']}")
    return Response(content=str(response), media_type="application/xml")


# ── Process recording ────────────────────────────────────────────────────────

@router.post("/process-recording")
async def process_recording(request: Request):
    form          = await request.form()
    call_id       = request.query_params.get("call_id")
    recording_url = form.get("RecordingUrl", "") + ".mp3"

    # FIX 1: Ignore post-hangup Twilio callbacks (0-second recordings).
    # Twilio fires one final /process-recording after the caller hangs up.
    # Without this guard, run_pipeline gets silence → STT returns "" →
    # pipeline crashes in the registered/general stage → 500 → "application error".
    recording_duration = int(form.get("RecordingDuration", "1") or "1")
    if recording_duration < 1:
        response = VoiceResponse()
        response.hangup()
        return Response(content=str(response), media_type="application/xml")

    if not call_id:
        print("[process-recording] WARNING: no call_id in query params — state will be lost")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            recording_url,
            auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        )
        audio_data = resp.content

    os.makedirs(TEMP_DIR, exist_ok=True)
    tmp = os.path.join(TEMP_DIR, f"{uuid.uuid4()}.mp3")
    with open(tmp, "wb") as f:
        f.write(audio_data)

    result = run_pipeline(tmp, call_id=call_id)

    audio_url = result["audio_path"]
    print(f"[TWIML] call_id={call_id} audio_url={audio_url!r}")

    if not audio_url or not audio_url.startswith("http"):
        print(f"[TWIML ERROR] Invalid audio_url {audio_url!r} — BASE_URL may be misconfigured")
        response = VoiceResponse()
        response.say("I'm sorry, there was a technical issue. Please call back.")
        response.hangup()
        return Response(content=str(response), media_type="application/xml")

    response = VoiceResponse()
    response.play(audio_url)

    # FIX 2: After complaint registration (stage="registered"), hang up cleanly
    # instead of issuing another <Record>. Without this, Twilio records the
    # silence/hangup after the goodbye TTS and fires another /process-recording,
    # which hits the registered stage → _llm_general → potential crash.
    from backend.services import conversation_state as cs
    state     = cs.get_or_create(call_id) if call_id else None
    call_done = state and getattr(state, "stage", "") == "registered"

    if call_done:
        response.hangup()
        # Reset state so a future call from same number starts fresh
        if call_id:
            cs.reset(call_id)
    else:
        response.record(
            action=f"{BASE_URL}/process-recording?call_id={call_id}",
            method="POST",
            max_length=15,
        )

    return Response(content=str(response), media_type="application/xml")


# ── Call status callback ─────────────────────────────────────────────────────

@router.post("/call-status")
async def call_status(request: Request):
    form    = await request.form()
    call_id = request.query_params.get("call_id")
    status  = form.get("CallStatus", "completed")

    if status in ("completed", "busy", "failed", "no-answer") and call_id:
        ended = db.end_call(call_id)
        if ended:
            await db.broadcast("call_ended", {"call": ended})
            await db.broadcast("stats_update", db.get_stats())

    return Response(content="OK")


# ── Outbound call ────────────────────────────────────────────────────────────

def _fire_sync(coro):
    """Schedule a coroutine safely from sync code inside FastAPI's event loop."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(coro)
        else:
            loop.run_until_complete(coro)
    except RuntimeError:
        asyncio.run(coro)


def make_call(to_number: str):
    call = db.create_call(phone=to_number, direction="outbound")
    _fire_sync(db.broadcast("call_started", {"call": call, "transcript": []}))

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    twilio_call = client.calls.create(
        to=to_number,
        from_=TWILIO_PHONE,
        url=f"{BASE_URL}/outbound?call_id={call['id']}",
        status_callback=f"{BASE_URL}/call-status?call_id={call['id']}",
        status_callback_method="POST",
    )
    print("Call SID:", twilio_call.sid)
    return call


def make_feedback_call(to_number: str, citizen_name: str = "Citizen",
                       feedback_id: str = "", complaint_id: str = "",
                       service: str = ""):
    call = db.create_call(phone=to_number, direction="outbound")

    subject = complaint_id or service or "our service"
    params = (
        f"call_id={call['id']}"
        f"&feedback_id={feedback_id}"
        f"&citizen={citizen_name.replace(' ', '+')}"
        f"&subject={subject.replace(' ', '+')}"
    )

    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        twilio_call = client.calls.create(
            to=to_number,
            from_=TWILIO_PHONE,
            url=f"{BASE_URL}/feedback-call?{params}",
            status_callback=f"{BASE_URL}/call-status?call_id={call['id']}",
            status_callback_method="POST",
        )
        print(f"[FEEDBACK CALL] SID: {twilio_call.sid} → {to_number}")
    except Exception as e:
        print(f"[FEEDBACK CALL] Twilio error: {e}")
        db.end_call(call["id"])

    return call


@router.post("/feedback-call")
async def feedback_call_twiml(request: Request):
    params      = request.query_params
    call_id     = params.get("call_id", "")
    feedback_id = params.get("feedback_id", "")
    citizen     = params.get("citizen", "Citizen").replace("+", " ")
    subject     = params.get("subject", "our service").replace("+", " ")

    response = VoiceResponse()
    response.say(
        f"Namaste {citizen}. "
        f"This is Bharat Echo, your government services assistant. "
        f"We are calling to collect your feedback regarding Complaint: {subject}. "
        f"On a scale of 1 to 5, how satisfied are you with the service? "
        f"1 represents very dissatisfied, and 5 represents very satisfied.",
        language="en-IN",
    )
    response.gather(
        num_digits=1,
        action=f"{BASE_URL}/feedback-response?call_id={call_id}&feedback_id={feedback_id}",
        method="POST",
        timeout=10,
    )
    response.say("We did not receive your response. Thank you for your time. Goodbye.", language="en-IN")
    response.hangup()
    return Response(content=str(response), media_type="application/xml")


@router.post("/feedback-response")
async def feedback_response(request: Request):
    form        = await request.form()
    params      = request.query_params
    call_id     = params.get("call_id", "")
    feedback_id = params.get("feedback_id", "")
    digit       = form.get("Digits", "")

    RATING_MESSAGES = {
        "1": "Thank you for your feedback. We are sorry to hear about your experience and will work to improve.",
        "2": "Thank you. We will take note of your feedback and try to do better.",
        "3": "Thank you for your neutral feedback. We will continue to work on improving our services.",
        "4": "Thank you for your positive feedback. We are glad we could help.",
        "5": "Thank you so much for your excellent feedback! We are delighted to hear that.",
    }

    message = RATING_MESSAGES.get(digit, "Thank you for your feedback.")

    if feedback_id and digit in "12345":
        from backend.routes import data_base as _db
        _db.complete_feedback(
            feedback_id,
            rating=int(digit),
            comment="Collected via automated outbound call",
        )
        print(f"[FEEDBACK RESPONSE] feedback_id={feedback_id} rating={digit}")

    response = VoiceResponse()
    response.say(
        f"{message} "
        f"This was BharatEcho government services. "
        f"If you have any complaints or queries, feel free to call us back. "
        f"Thank you.",
        language="en-IN",
    )
    response.hangup()
    return Response(content=str(response), media_type="application/xml")


@router.post("/outbound")
async def outbound(request: Request):
    call_id = request.query_params.get("call_id")
    response = VoiceResponse()
    response.say("Namaste. This is BharatEcho government services calling for a follow-up survey.")
    response.say("Are you satisfied with the resolution of your complaint? Press 1 for yes, 2 for no.")
    response.gather(
        num_digits=1,
        action=f"{BASE_URL}/handle-survey?call_id={call_id}",
    )
    return Response(str(response), media_type="application/xml")


@router.post("/handle-survey")
async def handle_survey(request: Request):
    form    = await request.form()
    call_id = request.query_params.get("call_id")
    digit   = form.get("Digits")

    sentiment = "Positive" if digit == "1" else "Negative"
    text      = "Satisfied with service" if digit == "1" else "Not satisfied with service"

    if call_id:
        db.append_transcript(call_id, "user", text)
        for c in db.calls_db:
            if c["id"] == call_id:
                c["sentiment"] = sentiment

    response = VoiceResponse()
    if digit == "1":
        response.say("Thank you for your positive feedback. Have a great day.")
    else:
        response.say("We apologize for the inconvenience. Your feedback has been recorded and we will work to improve.")
    response.hangup()
    return Response(str(response), media_type="application/xml")
