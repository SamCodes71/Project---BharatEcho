# main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from backend.routes import call, ai
from backend.config import STATIC_DIR
from backend.routes import data_base as db
import os

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(call.router)
app.include_router(ai.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.on_event("startup")
async def _close_zombie_calls():
    """Mark any calls left active from a previous server run as completed."""
    from datetime import datetime
    from backend.routes.data_base import _conn, _row_to_dict
    with _conn() as conn:
        rows = conn.execute("SELECT id FROM calls WHERE status='active'").fetchall()
        if rows:
            now = datetime.utcnow().isoformat()
            conn.execute(
                "UPDATE calls SET status='completed', ended_at=?, duration='0m 0s' WHERE status='active'",
                (now,),
            )
            print(f"[startup] Closed {len(rows)} zombie active call(s)")

# ── Core ──────────────────────────────────────────────────────────────────────
@app.get("/api/stats")
def stats(): return JSONResponse(db.get_stats())

@app.get("/api/calls")
def list_calls(): return JSONResponse(list(reversed(db.calls_db)))

@app.get("/api/complaints")
def list_complaints(): return JSONResponse(list(reversed(db.complaints_db)))

@app.get("/api/transcript/{call_id}")
def get_transcript(call_id: str): return JSONResponse(db.get_transcript(call_id))

@app.get("/api/active-call")
def active_call():
    c = db.get_active_call()
    return JSONResponse({"call": c, "transcript": db.get_transcript(c["id"]) if c else []})

@app.post("/api/reset-session/{call_id}")
def reset_session(call_id: str):
    from backend.services import conversation_state as cs
    cs.reset(call_id)
    return JSONResponse({"reset": True})

@app.post("/api/calls/start")
async def start_call_api():
    """Create a browser-originated call record so it appears in the dashboard."""
    call = db.create_call(phone="Web Browser", direction="inbound")
    await db.broadcast("call_started", {"call": call, "transcript": []})
    await db.broadcast("stats_update", db.get_stats())
    return JSONResponse(call)

@app.post("/api/calls/{call_id}/end")
async def end_call_api(call_id: str):
    """Explicitly end a call from the dashboard / browser voice agent."""
    ended = db.end_call(call_id)
    if not ended:
        return JSONResponse({"error": "call not found or already ended"}, status_code=404)
    await db.broadcast("call_ended", {"call": ended})
    await db.broadcast("stats_update", db.get_stats())
    from backend.services import conversation_state as cs
    cs.reset(call_id)
    return JSONResponse(ended)

@app.post("/api/calls/end-all-active")
async def end_all_active_calls():
    """End every call currently marked active — call this on page load to clear zombie calls."""
    from datetime import datetime
    from backend.routes.data_base import _conn, _row_to_dict
    ended_ids = []
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM calls WHERE status='active'").fetchall()
        now = datetime.utcnow().isoformat()
        for row in rows:
            call = _row_to_dict(row)
            conn.execute(
                "UPDATE calls SET status='completed', ended_at=?, duration='0m 0s' WHERE id=?",
                (now, call["id"]),
            )
            ended_ids.append(call["id"])
    if ended_ids:
        await db.broadcast("stats_update", db.get_stats())
    return JSONResponse({"ended": ended_ids})

# ── Complaints CRUD ───────────────────────────────────────────────────────────
class ComplaintUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None

class ComplaintCreate(BaseModel):
    citizen:     str
    phone:       str = ""
    category:    str = "general"
    issue:       str
    priority:    str = "Medium"
    language:    str = "English"
    call_id:     str = ""

@app.post("/api/complaints")
def create_complaint_manual(body: ComplaintCreate):
    complaint = db.create_complaint(
        call_id      = body.call_id or "manual",
        category     = body.category,
        description  = body.issue,
        citizen_name = body.citizen,
        phone        = body.phone,
        language     = body.language,
    )
    complaint["priority"] = body.priority
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(db.broadcast("stats_update", db.get_stats()))
    except Exception: pass
    return JSONResponse(complaint)


@app.patch("/api/complaints/{complaint_id}")
def update_complaint(complaint_id: str, body: ComplaintUpdate):
    # Read current record first
    c = db.get_complaint(complaint_id)
    if not c:
        return JSONResponse({"error": "not found"}, status_code=404)

    # Write updated fields to SQLite
    c = db.update_complaint_fields(
        complaint_id,
        status=body.status,
        priority=body.priority,
        assigned_to=body.assigned_to,
    )

    # Handle resolution side-effects
    if body.status == "Resolved" and not c.get("resolved_at"):
        c = db.resolve_complaint(complaint_id)
        if db.get_settings().get("survey_after_resolution", True):
            db.create_feedback(
                complaint_id=c["id"], service=c["category"],
                citizen_name=c["citizen"], phone=c["phone"],
                call_id=c["call_id"],
            )

    db.add_notification(
        title=f"Complaint {body.status or 'Updated'}",
        message=f"{c['citizen']}'s {c['category']} complaint → {c['status']}",
        kind="complaint", ref_id=complaint_id,
    )
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(db.broadcast("stats_update", db.get_stats()))
    except Exception: pass
    return JSONResponse(c)

@app.delete("/api/complaints/{complaint_id}")
def delete_complaint(complaint_id: str):
    deleted = db.delete_complaint(complaint_id)
    return JSONResponse({"deleted": deleted})

# ── Feedback ──────────────────────────────────────────────────────────────────
@app.get("/api/feedback")
def list_feedback(): return JSONResponse(db.get_feedback_stats())

class FeedbackCreate(BaseModel):
    citizen: str
    phone:   str = ""
    complaint_id: str = ""
    service: str = ""

@app.post("/api/feedback")
def create_feedback(body: FeedbackCreate):
    fb = db.create_feedback(
        complaint_id=body.complaint_id,
        service=body.service or body.complaint_id,
        citizen_name=body.citizen,
        phone=body.phone,
    )

    # ── Auto outbound call ────────────────────────────────────────────────────
    # If a valid phone number is provided, trigger an automated feedback call
    phone = (body.phone or "").strip()
    if phone and phone not in ("Unknown", "—", ""):
        try:
            from backend.routes.call import make_feedback_call
            make_feedback_call(
                to_number=phone,
                citizen_name=body.citizen,
                feedback_id=fb["id"],
                complaint_id=body.complaint_id,
                service=body.service,
            )
            fb["call_scheduled"] = True
            db.add_notification(
                title="Feedback Call Scheduled",
                message=f"Outbound call to {body.citizen} ({phone}) scheduled for feedback {fb['id']}",
                kind="call", ref_id=fb["id"],
            )
        except Exception as e:
            print(f"[FEEDBACK CALL] Could not schedule call: {e}")
            fb["call_scheduled"] = False
    else:
        fb["call_scheduled"] = False

    return JSONResponse(fb)

class FeedbackComplete(BaseModel):
    rating: int
    comment: str = ""

@app.post("/api/feedback/{fb_id}/complete")
def complete_feedback(fb_id: str, body: FeedbackComplete):
    fb = db.complete_feedback(fb_id, body.rating, body.comment)
    if not fb: return JSONResponse({"error": "not found"}, status_code=404)
    return JSONResponse(fb)

@app.delete("/api/feedback/{fb_id}")
def delete_feedback(fb_id: str):
    deleted = db.delete_feedback_item(fb_id)
    return JSONResponse({"deleted": deleted})

# ── Surveys ───────────────────────────────────────────────────────────────────
@app.get("/api/surveys/meta")
def survey_meta():
    """Return department & scheme lists for the create-survey dropdown."""
    return JSONResponse({
        "departments": db.SURVEY_DEPARTMENTS,
        "schemes":     db.SURVEY_SCHEMES,
    })

@app.get("/api/surveys")
def list_surveys(): return JSONResponse(db.get_survey_stats())

@app.get("/api/surveys/{survey_id}")
def get_survey(survey_id: str):
    s = db.get_survey_with_responses(survey_id)
    if not s: return JSONResponse({"error": "not found"}, status_code=404)
    return JSONResponse(s)

class QuestionModel(BaseModel):
    id:      str
    text:    str
    type:    str          # rating | yesno | text | mcq
    options: List[str] = []

class SurveyCreate(BaseModel):
    title:       str
    description: str = ""
    target:      str              # department | scheme | general
    target_name: str = ""
    questions:   List[QuestionModel]
    created_by:  str = "Admin"

@app.post("/api/surveys")
def create_survey(body: SurveyCreate):
    s = db.create_survey(
        title=body.title, description=body.description,
        target=body.target, target_name=body.target_name,
        questions=[q.model_dump() for q in body.questions],
        created_by=body.created_by,
    )
    return JSONResponse(s)

class SurveyResponseModel(BaseModel):
    respondent: str = "Anonymous"
    phone:      str = ""
    answers:    List[Dict[str, Any]]

@app.post("/api/surveys/{survey_id}/respond")
def respond_survey(survey_id: str, body: SurveyResponseModel):
    r = db.submit_survey_response(survey_id, body.answers, body.respondent, body.phone)
    if not r: return JSONResponse({"error": "survey not found or closed"}, status_code=404)
    return JSONResponse(r)

@app.post("/api/surveys/{survey_id}/close")
def close_survey(survey_id: str):
    s = db.close_survey(survey_id)
    if not s:
        return JSONResponse({"error": "not found"}, status_code=404)
    return JSONResponse(s)

@app.delete("/api/surveys/{survey_id}")
def delete_survey(survey_id: str):
    deleted = db.delete_survey(survey_id)
    return JSONResponse({"deleted": deleted})

# ── Notifications ─────────────────────────────────────────────────────────────
@app.get("/api/notifications")
def list_notifications():
    return JSONResponse({"items": list(db.notifications_db), "unread": db.unread_count()})

@app.post("/api/notifications/read-all")
def mark_all_read():
    db.mark_all_read(); return JSONResponse({"ok": True})

@app.post("/api/notifications/{notif_id}/read")
def mark_read(notif_id: str):
    db.mark_read(notif_id); return JSONResponse({"ok": True})

# ── Settings ──────────────────────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(): return JSONResponse(db.get_settings())

class SettingsUpdate(BaseModel):
    updates: Dict[str, Any]

@app.post("/api/settings")
def update_settings(body: SettingsUpdate):
    return JSONResponse(db.update_settings(body.updates))

# ── Analytics ─────────────────────────────────────────────────────────────────
@app.get("/api/analytics")
def get_analytics(): return JSONResponse(db.get_analytics())

# ── WebSocket ─────────────────────────────────────────────────────────────────
@app.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    await websocket.accept()
    db.register_ws(websocket)
    await websocket.send_json({"event": "stats_update", "data": db.get_stats()})
    active = db.get_active_call()
    if active:
        await websocket.send_json({"event": "call_started",
            "data": {"call": active, "transcript": db.get_transcript(active["id"])}})
    try:
        while True: await websocket.receive_text()
    except WebSocketDisconnect:
        db.unregister_ws(websocket)

@app.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    from backend.services.pipeline import run_pipeline
    import uuid as _uuid, os
    from backend.config import TEMP_DIR
    await websocket.accept()
    call = db.create_call(phone="Web Browser", direction="inbound")
    await db.broadcast("call_started", {"call": call, "transcript": []})
    os.makedirs(TEMP_DIR, exist_ok=True)
    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            tmp = os.path.join(TEMP_DIR, f"{_uuid.uuid4()}.wav")
            with open(tmp, "wb") as f: f.write(audio_bytes)
            result = run_pipeline(tmp, call_id=call["id"])
            from backend.services.tts import get_filepath_from_url
            with open(get_filepath_from_url(result["audio_path"]), "rb") as f:
                await websocket.send_bytes(f.read())
    except WebSocketDisconnect:
        ended = db.end_call(call["id"])
        if ended: await db.broadcast("call_ended", {"call": ended})
        db.unregister_ws(websocket)

@app.get("/")
def root(): return {"message": "BharatEcho AI Calling Backend Running"}
