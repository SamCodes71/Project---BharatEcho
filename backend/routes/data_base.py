# data_base.py  —  SQLite-backed storage
#
# Drop-in replacement for the in-memory version.
# Every public function signature is identical — nothing else in the codebase changes.
#
# Database file: backend/bharatecho.db  (auto-created on first run)
# To wipe all data: delete bharatecho.db and restart.

import os
import json
import uuid
import sqlite3
import threading
from typing import List, Dict, Any, Optional
from datetime import datetime
from contextlib import contextmanager

# ── Database path ─────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# routes/data_base.py lives in backend/routes/ — go up one level to backend/
DB_PATH = os.path.normpath(os.path.join(BASE_DIR, "..", "bharatecho.db"))

_local = threading.local()


class _ReversibleProxy:
    """Mixin that makes proxy objects support reversed() by materialising to a list."""
    def __reversed__(self):
        return reversed(list(self.__iter__()))


@contextmanager
def _conn():
    """Thread-local SQLite connection with WAL mode for concurrency."""
    if not hasattr(_local, "connection") or _local.connection is None:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.connection = conn
    try:
        yield _local.connection
        _local.connection.commit()
    except Exception:
        _local.connection.rollback()
        raise


def _row_to_dict(row) -> Dict:
    """sqlite3.Row -> plain dict, deserialising any JSON columns."""
    if row is None:
        return None
    d = dict(row)
    for key, val in d.items():
        if isinstance(val, str) and val and val[0] in ("{", "["):
            try:
                d[key] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass
    return d


# ── Schema ────────────────────────────────────────────────────────────────────

def _init_db():
    with _conn() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS calls (
            id           TEXT PRIMARY KEY,
            phone        TEXT,
            direction    TEXT,
            status       TEXT,
            sentiment    TEXT,
            language     TEXT,
            started_at   TEXT,
            ended_at     TEXT,
            duration     TEXT,
            complaint_id TEXT
        );

        CREATE TABLE IF NOT EXISTS complaints (
            id             TEXT PRIMARY KEY,
            call_id        TEXT,
            citizen        TEXT,
            phone          TEXT,
            category       TEXT,
            issue          TEXT,
            department     TEXT,
            assigned_to    TEXT,
            status         TEXT,
            priority       TEXT,
            sentiment      TEXT,
            language       TEXT,
            created_at     TEXT,
            follow_up_date TEXT,
            resolved_at    TEXT
        );

        CREATE TABLE IF NOT EXISTS transcripts (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id  TEXT,
            speaker  TEXT,
            text     TEXT,
            ts       TEXT
        );

        CREATE TABLE IF NOT EXISTS feedback (
            id           TEXT PRIMARY KEY,
            complaint_id TEXT,
            service      TEXT,
            citizen      TEXT,
            phone        TEXT,
            call_id      TEXT,
            status       TEXT,
            rating       INTEGER,
            comment      TEXT,
            created_at   TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS surveys (
            id             TEXT PRIMARY KEY,
            title          TEXT,
            description    TEXT,
            target         TEXT,
            target_name    TEXT,
            questions      TEXT,
            created_by     TEXT,
            status         TEXT,
            created_at     TEXT,
            closed_at      TEXT,
            response_count INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS survey_responses (
            id           TEXT PRIMARY KEY,
            survey_id    TEXT,
            respondent   TEXT,
            phone        TEXT,
            answers      TEXT,
            submitted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id         TEXT PRIMARY KEY,
            title      TEXT,
            message    TEXT,
            kind       TEXT,
            ref_id     TEXT,
            read       INTEGER DEFAULT 0,
            created_at TEXT
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        );
        """)

        if db.execute("SELECT COUNT(*) FROM settings").fetchone()[0] == 0:
            defaults = {
                "auto_followup_days": 4,
                "escalation_threshold": "Angry",
                "default_language": "English",
                "tts_language": "en",
                "notifications_enabled": True,
                "survey_after_resolution": True,
                "working_hours_start": "09:00",
                "working_hours_end": "18:00",
                "max_call_duration": 15,
                "twilio_phone": "",
                "ngrok_url": "",
                "ui_language": "English",
            }
            for k, v in defaults.items():
                db.execute(
                    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                    (k, json.dumps(v)),
                )


_init_db()


# ── WebSocket registry (in-memory — per-process) ──────────────────────────────

_ws_clients: List[Any] = []


def register_ws(ws):
    _ws_clients.append(ws)


def unregister_ws(ws):
    if ws in _ws_clients:
        _ws_clients.remove(ws)


async def broadcast(event: str, data: dict):
    msg = json.dumps({"event": event, "data": data})
    dead = []
    for ws in _ws_clients:
        try:
            await ws.send_text(msg)
        except Exception as e:  # chnaged here remove 'as e'
            print(f"ws error") #this
            dead.append(ws)
    for ws in dead:
        unregister_ws(ws)


# ── Calls ─────────────────────────────────────────────────────────────────────

class _LiveCallDict(dict):
    """Dict that writes mutated fields back to SQLite immediately.
    pipeline.py does: c["complaint_id"] = ...; c["sentiment"] = ...
    """
    def __setitem__(self, key, value):
        super().__setitem__(key, value)
        call_id = self.get("id")
        if call_id and key in ("complaint_id", "sentiment", "status",
                                "ended_at", "duration", "language"):
            try:
                with _conn() as db:
                    db.execute(f"UPDATE calls SET {key}=? WHERE id=?", (value, call_id))
            except Exception:
                pass


def create_call(phone: str = "Unknown", direction: str = "inbound") -> Dict:
    call = _LiveCallDict({
        "id":           f"CALL-{'IN' if direction == 'inbound' else 'OUT'}-{str(uuid.uuid4())[:6].upper()}",
        "phone":        phone,
        "direction":    direction,
        "status":       "active",
        "sentiment":    "Neutral",
        "language":     "English",
        "started_at":   datetime.utcnow().isoformat(),
        "ended_at":     None,
        "duration":     None,
        "complaint_id": None,
    })
    with _conn() as db:
        db.execute(
            "INSERT INTO calls VALUES (:id,:phone,:direction,:status,:sentiment,"
            ":language,:started_at,:ended_at,:duration,:complaint_id)",
            call,
        )
    return call


def end_call(call_id: str, sentiment: str = "Neutral") -> Optional[Dict]:
    with _conn() as db:
        row = db.execute("SELECT * FROM calls WHERE id=?", (call_id,)).fetchone()
        if not row:
            return None
        call = _row_to_dict(row)
        ended_at = datetime.utcnow().isoformat()
        secs     = int((datetime.fromisoformat(ended_at) -
                        datetime.fromisoformat(call["started_at"])).total_seconds())
        duration = f"{secs // 60}m {secs % 60}s"
        db.execute(
            "UPDATE calls SET status='completed', ended_at=?, sentiment=?, duration=? WHERE id=?",
            (ended_at, sentiment, duration, call_id),
        )
        call.update(status="completed", ended_at=ended_at,
                    sentiment=sentiment, duration=duration)
    return call


def get_active_call() -> Optional[Dict]:
    with _conn() as db:
        row = db.execute(
            "SELECT * FROM calls WHERE status='active' ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
    if not row:
        return None
    return _LiveCallDict(_row_to_dict(row))


class _CallsProxy(_ReversibleProxy):
    """Lets main.py treat calls_db like a list while reading from SQLite."""
    def __iter__(self):
        with _conn() as db:
            rows = db.execute("SELECT * FROM calls ORDER BY started_at ASC").fetchall()
        return iter([_LiveCallDict(_row_to_dict(r)) for r in rows])

    def __len__(self):
        with _conn() as db:
            return db.execute("SELECT COUNT(*) FROM calls").fetchone()[0]

    def append(self, item): pass


calls_db = _CallsProxy()


# ── Transcripts ───────────────────────────────────────────────────────────────

def append_transcript(call_id: str, speaker: str, text: str) -> Dict:
    ts = datetime.utcnow().isoformat()
    with _conn() as db:
        db.execute(
            "INSERT INTO transcripts (call_id, speaker, text, ts) VALUES (?,?,?,?)",
            (call_id, speaker, text, ts),
        )
    return {"speaker": speaker, "text": text, "ts": ts}


def get_transcript(call_id: str) -> List[Dict]:
    with _conn() as db:
        rows = db.execute(
            "SELECT speaker, text, ts FROM transcripts WHERE call_id=? ORDER BY id ASC",
            (call_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Complaints ────────────────────────────────────────────────────────────────

def _dept_map(category: str) -> str:
    return {
        "electricity": "Electricity Board",
        "water":       "Water Department",
        "road":        "Highway Department",
        "sanitation":  "Municipal Corporation",
    }.get(category.lower(), "General Administration")


def create_complaint(call_id: str, category: str, description: str,
                     citizen_name: str = "Unknown", phone: str = "Unknown",
                     language: str = "English") -> Dict:
    complaint = {
        "id":             f"CMP-{datetime.utcnow().year}-{str(uuid.uuid4())[:4].upper()}",
        "call_id":        call_id,
        "citizen":        citizen_name,
        "phone":          phone,
        "category":       category,
        "issue":          description,
        "department":     _dept_map(category),
        "assigned_to":    "Pending Assignment",
        "status":         "Pending",
        "priority":       "Medium",
        "sentiment":      "Neutral",
        "language":       language,
        "created_at":     datetime.utcnow().isoformat(),
        "follow_up_date": None,
        "resolved_at":    None,
    }
    with _conn() as db:
        db.execute(
            "INSERT INTO complaints VALUES (:id,:call_id,:citizen,:phone,:category,"
            ":issue,:department,:assigned_to,:status,:priority,:sentiment,:language,"
            ":created_at,:follow_up_date,:resolved_at)",
            complaint,
        )
    add_notification(
        title=f"New {category.title()} Complaint",
        message=f"{citizen_name} registered: {description[:60]}{'…' if len(description) > 60 else ''}",
        kind="complaint",
        ref_id=complaint["id"],
    )
    return complaint


class _ComplaintsProxy(_ReversibleProxy):
    def __iter__(self):
        with _conn() as db:
            rows = db.execute("SELECT * FROM complaints ORDER BY created_at ASC").fetchall()
        return iter([_row_to_dict(r) for r in rows])

    def __len__(self):
        with _conn() as db:
            return db.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]

    def append(self, item): pass

    def __setitem__(self, key, value):
        # main.py: complaints_db[:] = [c for c in complaints_db if c["id"] != x]
        existing = {r["id"] for r in self}
        new_ids  = {r["id"] for r in value}
        for rid in existing - new_ids:
            with _conn() as db:
                db.execute("DELETE FROM complaints WHERE id=?", (rid,))


complaints_db = _ComplaintsProxy()


# ── Feedback ──────────────────────────────────────────────────────────────────

def create_feedback(complaint_id: str = "", service: str = "",
                    citizen_name: str = "Unknown", phone: str = "Unknown",
                    call_id: str = "") -> Dict:
    fb = {
        "id":           f"FB-{str(uuid.uuid4())[:6].upper()}",
        "complaint_id": complaint_id,
        "service":      service,
        "citizen":      citizen_name,
        "phone":        phone,
        "call_id":      call_id,
        "status":       "pending",
        "rating":       None,
        "comment":      None,
        "created_at":   datetime.utcnow().isoformat(),
        "completed_at": None,
    }
    with _conn() as db:
        db.execute(
            "INSERT INTO feedback VALUES (:id,:complaint_id,:service,:citizen,"
            ":phone,:call_id,:status,:rating,:comment,:created_at,:completed_at)",
            fb,
        )
    return fb


def complete_feedback(fb_id: str, rating: int, comment: str = "") -> Optional[Dict]:
    completed_at = datetime.utcnow().isoformat()
    with _conn() as db:
        db.execute(
            "UPDATE feedback SET status='completed', rating=?, comment=?, completed_at=? WHERE id=?",
            (rating, comment, completed_at, fb_id),
        )
        row = db.execute("SELECT * FROM feedback WHERE id=?", (fb_id,)).fetchone()
    if not row:
        return None
    fb = _row_to_dict(row)
    add_notification(
        title="Feedback Received",
        message=f"{fb['citizen']} rated {fb['service'] or fb['complaint_id']}: {rating}/5",
        kind="survey",
        ref_id=fb_id,
    )
    return fb


def get_feedback_stats() -> Dict:
    with _conn() as db:
        total     = db.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]
        completed = db.execute("SELECT COUNT(*) FROM feedback WHERE status='completed'").fetchone()[0]
        pending   = db.execute("SELECT COUNT(*) FROM feedback WHERE status='pending'").fetchone()[0]
        ratings   = [r[0] for r in db.execute(
            "SELECT rating FROM feedback WHERE status='completed' AND rating IS NOT NULL"
        ).fetchall()]
        recent    = db.execute(
            "SELECT * FROM feedback ORDER BY created_at DESC LIMIT 30"
        ).fetchall()

    avg  = round(sum(ratings) / len(ratings), 1) if ratings else 0.0
    dist = {str(i): ratings.count(i) for i in range(1, 6)}
    return {
        "total": total, "completed": completed, "pending": pending,
        "avg_rating": avg, "distribution": dist,
        "recent": [_row_to_dict(r) for r in recent],
    }


class _FeedbackProxy(_ReversibleProxy):
    def __iter__(self):
        with _conn() as db:
            rows = db.execute("SELECT * FROM feedback ORDER BY created_at ASC").fetchall()
        return iter([_row_to_dict(r) for r in rows])

    def __len__(self):
        with _conn() as db:
            return db.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]

    def append(self, item): pass

    def __setitem__(self, key, value):
        existing = {r["id"] for r in self}
        new_ids  = {r["id"] for r in value}
        for rid in existing - new_ids:
            with _conn() as db:
                db.execute("DELETE FROM feedback WHERE id=?", (rid,))


feedback_db = _FeedbackProxy()


# ── Surveys ───────────────────────────────────────────────────────────────────

SURVEY_DEPARTMENTS = [
    "Electricity Board", "Water Department", "Highway Department",
    "Municipal Corporation", "Public Health Department",
    "Agriculture Department", "Revenue Department",
    "Education Department", "Transport Department",
    "Housing Board", "Urban Development", "Panchayati Raj", "Other",
]

SURVEY_SCHEMES = [
    "PM Kisan Samman Nidhi", "Ayushman Bharat", "Ujjwala Yojana",
    "PM Awas Yojana", "Swachh Bharat Mission", "Digital India",
    "PM Jan Dhan Yojana", "Mudra Loan Scheme", "PM Fasal Bima Yojana",
    "Beti Bachao Beti Padhao", "National Pension Scheme",
    "Pradhan Mantri Kaushal Vikas Yojana", "Other",
]


def create_survey(title: str, description: str, target: str,
                  target_name: str, questions: List[Dict],
                  created_by: str = "Admin") -> Dict:
    survey_id = f"SRV-{str(uuid.uuid4())[:6].upper()}"
    created_at = datetime.utcnow().isoformat()
    with _conn() as db:
        db.execute(
            "INSERT INTO surveys VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (survey_id, title, description, target, target_name,
             json.dumps(questions), created_by, "active", created_at, None, 0),
        )
    survey = {
        "id": survey_id, "title": title, "description": description,
        "target": target, "target_name": target_name, "questions": questions,
        "created_by": created_by, "status": "active", "created_at": created_at,
        "closed_at": None, "response_count": 0,
    }
    add_notification(
        title="New Survey Created",
        message=f"'{title}' targeting {target_name}",
        kind="survey", ref_id=survey_id,
    )
    return survey


def submit_survey_response(survey_id: str, answers: List[Dict],
                            respondent: str = "Anonymous",
                            phone: str = "") -> Optional[Dict]:
    with _conn() as db:
        row = db.execute(
            "SELECT id FROM surveys WHERE id=? AND status='active'", (survey_id,)
        ).fetchone()
        if not row:
            return None
        resp_id = str(uuid.uuid4())
        submitted_at = datetime.utcnow().isoformat()
        db.execute(
            "INSERT INTO survey_responses VALUES (?,?,?,?,?,?)",
            (resp_id, survey_id, respondent, phone, json.dumps(answers), submitted_at),
        )
        db.execute(
            "UPDATE surveys SET response_count = response_count + 1 WHERE id=?",
            (survey_id,),
        )
    return {
        "id": resp_id, "survey_id": survey_id, "respondent": respondent,
        "phone": phone, "answers": answers, "submitted_at": submitted_at,
    }


def get_survey_with_responses(survey_id: str) -> Optional[Dict]:
    with _conn() as db:
        row = db.execute("SELECT * FROM surveys WHERE id=?", (survey_id,)).fetchone()
        if not row:
            return None
        survey = _row_to_dict(row)
        resp_rows = db.execute(
            "SELECT * FROM survey_responses WHERE survey_id=? ORDER BY submitted_at ASC",
            (survey_id,),
        ).fetchall()
    survey["responses"] = [_row_to_dict(r) for r in resp_rows]
    return survey


def get_survey_stats() -> Dict:
    with _conn() as db:
        total   = db.execute("SELECT COUNT(*) FROM surveys").fetchone()[0]
        active  = db.execute("SELECT COUNT(*) FROM surveys WHERE status='active'").fetchone()[0]
        closed  = db.execute("SELECT COUNT(*) FROM surveys WHERE status='closed'").fetchone()[0]
        total_r = db.execute("SELECT COUNT(*) FROM survey_responses").fetchone()[0]
        rows    = db.execute("SELECT * FROM surveys ORDER BY created_at DESC").fetchall()
    return {
        "total": total, "active": active, "closed": closed,
        "total_responses": total_r,
        "surveys": [_row_to_dict(r) for r in rows],
    }


class _SurveysProxy(_ReversibleProxy):
    def __iter__(self):
        with _conn() as db:
            rows = db.execute("SELECT * FROM surveys ORDER BY created_at ASC").fetchall()
        return iter([_row_to_dict(r) for r in rows])

    def __len__(self):
        with _conn() as db:
            return db.execute("SELECT COUNT(*) FROM surveys").fetchone()[0]

    def append(self, item): pass

    def __setitem__(self, key, value):
        existing = {r["id"] for r in self}
        new_ids  = {r["id"] for r in value}
        for sid in existing - new_ids:
            with _conn() as db:
                db.execute("DELETE FROM surveys WHERE id=?", (sid,))


class _SurveyResponsesProxy(_ReversibleProxy):
    def __iter__(self):
        with _conn() as db:
            rows = db.execute(
                "SELECT * FROM survey_responses ORDER BY submitted_at ASC"
            ).fetchall()
        return iter([_row_to_dict(r) for r in rows])

    def __len__(self):
        with _conn() as db:
            return db.execute("SELECT COUNT(*) FROM survey_responses").fetchone()[0]

    def append(self, item): pass

    def __setitem__(self, key, value):
        existing = {r["survey_id"] for r in self}
        new_ids  = {r["survey_id"] for r in value}
        for sid in existing - new_ids:
            with _conn() as db:
                db.execute("DELETE FROM survey_responses WHERE survey_id=?", (sid,))


surveys_db           = _SurveysProxy()
survey_responses_db  = _SurveyResponsesProxy()


# ── Notifications ─────────────────────────────────────────────────────────────

def add_notification(title: str, message: str,
                     kind: str = "info", ref_id: str = "") -> Dict:
    notif_id   = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    with _conn() as db:
        db.execute(
            "INSERT INTO notifications VALUES (?,?,?,?,?,0,?)",
            (notif_id, title, message, kind, ref_id, created_at),
        )
        db.execute(
            "DELETE FROM notifications WHERE id NOT IN "
            "(SELECT id FROM notifications ORDER BY created_at DESC LIMIT 100)"
        )
    return {
        "id": notif_id, "title": title, "message": message,
        "kind": kind, "ref_id": ref_id, "read": False, "created_at": created_at,
    }


def mark_read(notif_id: str):
    with _conn() as db:
        db.execute("UPDATE notifications SET read=1 WHERE id=?", (notif_id,))


def mark_all_read():
    with _conn() as db:
        db.execute("UPDATE notifications SET read=1")


def unread_count() -> int:
    with _conn() as db:
        return db.execute("SELECT COUNT(*) FROM notifications WHERE read=0").fetchone()[0]


class _NotificationsProxy(_ReversibleProxy):
    def __iter__(self):
        with _conn() as db:
            rows = db.execute(
                "SELECT * FROM notifications ORDER BY created_at DESC"
            ).fetchall()
        result = []
        for r in rows:
            d = _row_to_dict(r)
            d["read"] = bool(d["read"])
            result.append(d)
        return iter(result)

    def __len__(self):
        with _conn() as db:
            return db.execute("SELECT COUNT(*) FROM notifications").fetchone()[0]


notifications_db = _NotificationsProxy()


# ── Settings ──────────────────────────────────────────────────────────────────

def get_settings() -> Dict:
    with _conn() as db:
        rows = db.execute("SELECT key, value FROM settings").fetchall()
    return {r["key"]: json.loads(r["value"]) for r in rows}


def update_settings(updates: Dict) -> Dict:
    with _conn() as db:
        for k, v in updates.items():
            db.execute(
                "INSERT INTO settings (key, value) VALUES (?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (k, json.dumps(v)),
            )
    return get_settings()


# ── Update helpers (called by main.py instead of dict mutation) ──────────────

def get_complaint(complaint_id: str) -> Optional[Dict]:
    with _conn() as db:
        row = db.execute("SELECT * FROM complaints WHERE id=?", (complaint_id,)).fetchone()
    return _row_to_dict(row) if row else None


def update_complaint_fields(complaint_id: str, status: str = None,
                             priority: str = None, assigned_to: str = None) -> Optional[Dict]:
    """Update one or more fields of a complaint and return the updated record."""
    updates = {}
    if status      is not None: updates["status"]      = status
    if priority    is not None: updates["priority"]    = priority
    if assigned_to is not None: updates["assigned_to"] = assigned_to

    if not updates:
        return get_complaint(complaint_id)

    set_clause = ", ".join(f"{k}=?" for k in updates)
    values     = list(updates.values()) + [complaint_id]

    with _conn() as db:
        db.execute(f"UPDATE complaints SET {set_clause} WHERE id=?", values)
        row = db.execute("SELECT * FROM complaints WHERE id=?", (complaint_id,)).fetchone()
    return _row_to_dict(row) if row else None


def resolve_complaint(complaint_id: str) -> Optional[Dict]:
    """Set resolved_at timestamp on a complaint (called when status→Resolved)."""
    resolved_at = datetime.utcnow().isoformat()
    with _conn() as db:
        db.execute(
            "UPDATE complaints SET resolved_at=? WHERE id=? AND resolved_at IS NULL",
            (resolved_at, complaint_id),
        )
    return get_complaint(complaint_id)


def delete_complaint(complaint_id: str) -> bool:
    with _conn() as db:
        cur = db.execute("DELETE FROM complaints WHERE id=?", (complaint_id,))
    return cur.rowcount > 0


def delete_feedback_item(fb_id: str) -> bool:
    with _conn() as db:
        cur = db.execute("DELETE FROM feedback WHERE id=?", (fb_id,))
    return cur.rowcount > 0


def delete_survey(survey_id: str) -> bool:
    with _conn() as db:
        db.execute("DELETE FROM survey_responses WHERE survey_id=?", (survey_id,))
        cur = db.execute("DELETE FROM surveys WHERE id=?", (survey_id,))
    return cur.rowcount > 0


def close_survey(survey_id: str) -> Optional[Dict]:
    closed_at = datetime.utcnow().isoformat()
    with _conn() as db:
        db.execute(
            "UPDATE surveys SET status='closed', closed_at=? WHERE id=?",
            (closed_at, survey_id),
        )
        row = db.execute("SELECT * FROM surveys WHERE id=?", (survey_id,)).fetchone()
    return _row_to_dict(row) if row else None


# ── Analytics ─────────────────────────────────────────────────────────────────

def get_analytics() -> Dict:
    from collections import defaultdict

    with _conn() as db:
        call_rows = db.execute(
            "SELECT started_at, direction, sentiment FROM calls"
        ).fetchall()
        comp_rows = db.execute(
            "SELECT category, status, created_at, resolved_at FROM complaints"
        ).fetchall()

    day_calls: Dict = defaultdict(lambda: {"inbound": 0, "outbound": 0})
    sent_count: Dict = defaultdict(int)
    for r in call_rows:
        day_calls[r["started_at"][:10]][r["direction"]] += 1
        sent_count[r["sentiment"]] += 1

    cats: Dict = defaultdict(int)
    res_times = []
    for r in comp_rows:
        cats[r["category"]] += 1
        if r["status"] == "Resolved" and r["resolved_at"]:
            t1 = datetime.fromisoformat(r["created_at"])
            t2 = datetime.fromisoformat(r["resolved_at"])
            res_times.append((t2 - t1).total_seconds() / 60)

    fb = get_feedback_stats()
    s  = get_stats()

    return {
        "call_trend":             [{"date": k, **v} for k, v in sorted(day_calls.items())[-14:]],
        "sentiment_dist":         [{"name": k, "value": v} for k, v in sent_count.items()],
        "category_dist":          [{"name": k, "value": v} for k, v in cats.items()],
        "avg_resolution_minutes": round(sum(res_times) / len(res_times), 1) if res_times else 0,
        "satisfaction_avg":       fb["avg_rating"],
        "satisfaction_dist":      fb["distribution"],
        "total_calls":            s["calls"]["total"],
        "total_complaints":       s["complaints"]["total"],
        "total_surveys":          len(surveys_db),
        "resolution_rate":        s["complaints"]["resolution_rate"],
    }


# ── Full stats ────────────────────────────────────────────────────────────────

def get_stats() -> Dict:
    with _conn() as db:
        total_calls  = db.execute("SELECT COUNT(*) FROM calls").fetchone()[0]
        active_calls = db.execute("SELECT COUNT(*) FROM calls WHERE status='active'").fetchone()[0]
        inbound      = db.execute("SELECT COUNT(*) FROM calls WHERE direction='inbound'").fetchone()[0]
        outbound     = db.execute("SELECT COUNT(*) FROM calls WHERE direction='outbound'").fetchone()[0]
        total_comp   = db.execute("SELECT COUNT(*) FROM complaints").fetchone()[0]
        pending      = db.execute("SELECT COUNT(*) FROM complaints WHERE status='Pending'").fetchone()[0]
        resolved     = db.execute("SELECT COUNT(*) FROM complaints WHERE status='Resolved'").fetchone()[0]
        in_prog      = db.execute("SELECT COUNT(*) FROM complaints WHERE status='In Progress'").fetchone()[0]
        recent_calls = db.execute(
            "SELECT * FROM calls ORDER BY started_at DESC LIMIT 10"
        ).fetchall()
        recent_comp  = db.execute(
            "SELECT * FROM complaints ORDER BY created_at DESC LIMIT 10"
        ).fetchall()
        unread       = db.execute("SELECT COUNT(*) FROM notifications WHERE read=0").fetchone()[0]

    resolution_rate = round(resolved / total_comp * 100, 1) if total_comp else 0.0

    return {
        "calls": {
            "total": total_calls, "active": active_calls,
            "inbound": inbound, "outbound": outbound,
        },
        "complaints": {
            "total": total_comp, "pending": pending,
            "in_progress": in_prog, "resolved": resolved,
            "resolution_rate": resolution_rate,
        },
        "unread_notifications": unread,
        "recent_calls":      [_row_to_dict(r) for r in recent_calls],
        "recent_complaints": [_row_to_dict(r) for r in recent_comp],
    }
