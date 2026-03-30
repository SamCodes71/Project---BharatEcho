import os

# ── Read from environment variables — never hardcode credentials ──────────────
# Set these in a .env file or your deployment platform's environment settings.
BASE_URL           = os.environ.get("BASE_URL", "")
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN  = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE       = os.environ.get("TWILIO_PHONE", "")

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMP_DIR   = os.path.join(BASE_DIR, "temp")
