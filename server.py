"""Serve Pulse Point and email customer activity to the project mailbox."""

from __future__ import annotations

import json
import os
import re
import smtplib
import ssl
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


BASE_DIR = Path(__file__).resolve().parent
RECIPIENT = "pulsepoint034@gmail.com"


def _load_env_file() -> None:
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    try:
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" not in stripped:
                continue
            key, _, value = stripped.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except OSError:
        pass


_load_env_file()


MAX_BODY_BYTES = 16_384
MAX_EVENTS_PER_MINUTE = 60
RATE_WINDOW_SECONDS = 60
INTERESTS = {
    "First-aid training",
    "Volunteer responder community",
    "Innovation / technology",
    "Partnership & support",
}

FEEDBACK_TYPES = {
    "General",
    "Bug report",
    "Suggestion",
    "Praise",
    "Other",
}

EVENT_FIELDS = {
    "page_view": {"title": "text"},
    "section_view": {"section": "text", "title": "text"},
    "customer_action": {"label": "text", "target": "text", "section": "text"},
    "guide_open": {"guide": "text"},
    "guide_close": {"guide": "text"},
    "quiz_answer": {
        "question_number": "small_int",
        "question": "text",
        "choice": "text",
        "is_correct": "bool",
    },
    "quiz_complete": {"score": "small_int", "total": "small_int"},
    "challenge_retry": {},
    "join_submit": {"name": "name", "email": "email", "interest": "interest"},
    "join_error": {"reason": "reason"},
    "feedback_submit": {"name": "name", "email": "email", "type": "type", "message": "message"},
    "feedback_error": {"reason": "reason"},
}

_rate_lock = threading.Lock()
_event_times: dict[str, deque[float]] = defaultdict(deque)


class RequestError(Exception):
    def __init__(self, status: int, code: str) -> None:
        super().__init__(code)
        self.status = status
        self.code = code


def _email_settings() -> tuple[str, str, str, str] | None:
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    sender = os.environ.get("SMTP_FROM", username).strip()
    if not host or not username or not password or not sender:
        return None
    if "\r" in sender or "\n" in sender:
        return None
    return host, username, password, sender


def _clean_text(value: object, limit: int) -> str:
    if not isinstance(value, str):
        raise RequestError(400, "invalid_field")
    cleaned = re.sub(r"[\x00-\x1f\x7f]", " ", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if len(cleaned) > limit:
        raise RequestError(400, "field_too_long")
    return cleaned


def _sanitize_details(event: str, value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise RequestError(400, "invalid_details")

    clean: dict[str, object] = {}
    for key, kind in EVENT_FIELDS[event].items():
        if key not in value:
            continue
        raw = value[key]
        if kind == "text":
            clean[key] = _clean_text(raw, 300 if key == "question" else 120)
        elif kind == "small_int":
            if isinstance(raw, bool) or not isinstance(raw, int) or not 0 <= raw <= 100:
                raise RequestError(400, "invalid_field")
            clean[key] = raw
        elif kind == "bool":
            if not isinstance(raw, bool):
                raise RequestError(400, "invalid_field")
            clean[key] = raw
        elif kind == "name":
            name = _clean_text(raw, 100)
            if not name:
                raise RequestError(400, "invalid_name")
            clean[key] = name
        elif kind == "email":
            address = _clean_text(raw, 254)
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", address):
                raise RequestError(400, "invalid_email")
            clean[key] = address
        elif kind == "interest":
            interest = _clean_text(raw, 100)
            if interest not in INTERESTS:
                raise RequestError(400, "invalid_interest")
            clean[key] = interest
        elif kind == "reason":
            reason = _clean_text(raw, 40)
            if reason != "validation":
                raise RequestError(400, "invalid_field")
            clean[key] = reason
        elif kind == "type":
            ftype = _clean_text(raw, 40)
            if ftype not in FEEDBACK_TYPES:
                raise RequestError(400, "invalid_feedback_type")
            clean[key] = ftype
        elif kind == "message":
            message = _clean_text(raw, 1000)
            if not message:
                raise RequestError(400, "invalid_message")
            clean[key] = message

    if event == "join_submit" and set(clean) != {"name", "email", "interest"}:
        raise RequestError(400, "incomplete_registration")
    if event == "feedback_submit" and set(clean) != {"name", "email", "type", "message"}:
        raise RequestError(400, "incomplete_feedback")
    return clean


def _parse_event(payload: object) -> tuple[str, str, str, dict[str, object]]:
    if not isinstance(payload, dict):
        raise RequestError(400, "invalid_payload")

    event = payload.get("event")
    if not isinstance(event, str) or event not in EVENT_FIELDS:
        raise RequestError(400, "unknown_event")

    path = _clean_text(payload.get("path", "/"), 200)
    if not path.startswith("/") or "?" in path or "#" in path:
        raise RequestError(400, "invalid_path")

    session_id = _clean_text(payload.get("session_id", ""), 64)
    if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", session_id):
        raise RequestError(400, "invalid_session")

    details = _sanitize_details(event, payload.get("details", {}))
    return event, path, session_id, details


def _within_rate_limit(client_key: str) -> bool:
    now = time.monotonic()
    cutoff = now - RATE_WINDOW_SECONDS
    with _rate_lock:
        events = _event_times[client_key]
        while events and events[0] <= cutoff:
            events.popleft()
        if len(events) >= MAX_EVENTS_PER_MINUTE:
            return False
        events.append(now)
        return True


def _send_activity_email(
    event: str, path: str, session_id: str, details: dict[str, object]
) -> bool:
    settings = _email_settings()
    if settings is None:
        return False

    host, username, password, sender = settings
    try:
        port = int(os.environ.get("SMTP_PORT", "587"))
        use_ssl = os.environ.get("SMTP_USE_SSL", "").lower() in {"1", "true", "yes"}
        if not os.environ.get("SMTP_USE_SSL") and port == 465:
            use_ssl = True
    except ValueError:
        raise RequestError(503, "invalid_email_configuration") from None

    message = EmailMessage()
    message["From"] = sender
    message["To"] = RECIPIENT
    if event == "feedback_submit":
        subject = f"Pulse Point customer feedback | {details['type']}"
    else:
        subject = f"Pulse Point customer activity | {event.replace('_', ' ')}"
    message["Subject"] = subject
    message.set_content(
        "Pulse Point customer activity\n\n"
        f"Event: {event}\n"
        f"Received (UTC): {datetime.now(timezone.utc).isoformat(timespec='seconds')}\n"
        f"Page: {path}\n"
        f"Session: {session_id}\n\n"
        "Details:\n"
        + ("\n".join(f"- {key.replace('_', ' ').title()}: {value}" for key, value in details.items()) or "- None")
        + "\n"
    )

    try:
        if use_ssl:
            with smtplib.SMTP_SSL(
                host, port, timeout=12, context=ssl.create_default_context()
            ) as client:
                client.login(username, password)
                client.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=12) as client:
                client.ehlo()
                use_starttls = os.environ.get("SMTP_STARTTLS", "true").lower() not in {"0", "false", "no"}
                if use_starttls:
                    client.starttls(context=ssl.create_default_context())
                    client.ehlo()
                client.login(username, password)
                client.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        print(f"Email delivery failed ({type(error).__name__}).")
        raise RequestError(502, "email_delivery_failed") from None
    return True


class PulsePointHandler(BaseHTTPRequestHandler):
    server_version = "PulsePoint/1.0"

    def log_message(self, format_string: str, *args: object) -> None:
        code = args[1] if len(args) > 1 else "?"
        path = urlsplit(self.path).path
        print(f"{self.command} {path} {code}")

    def _send_json(self, status: int, body: dict[str, object]) -> None:
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(encoded)

    def _send_security_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; font-src 'self'; "
            "connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
        )

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/health":
            self._send_json(200, {"status": "ok", "email_configured": _email_settings() is not None})
            return

        public_files = {
            "/": "index.html",
            "/index.html": "index.html",
            "/style.css": "style.css",
            "/script.js": "script.js",
            "/assets/logo%201.jpeg": "assets/logo 1.jpeg",
            "/assets/inter-latin.woff2": "assets/inter-latin.woff2",
            "/assets/oswald-latin.woff2": "assets/oswald-latin.woff2",
        }
        file_name = public_files.get(path)
        if file_name is None:
            self._send_json(404, {"error": "not_found"})
            return

        file_path = BASE_DIR / file_name
        try:
            data = file_path.read_bytes()
        except OSError:
            self._send_json(500, {"error": "site_file_unavailable"})
            return

        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".woff2": "font/woff2",
        }[Path(file_name).suffix]
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self._send_security_headers()
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/events":
            self._send_json(404, {"error": "not_found"})
            return

        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "").lower()
        if origin and urlsplit(origin).netloc.lower() != host:
            self._send_json(403, {"error": "origin_not_allowed"})
            return

        if self.headers.get_content_type() != "application/json":
            self._send_json(415, {"error": "json_required"})
            return

        try:
            body_size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "invalid_content_length"})
            return
        if body_size <= 0 or body_size > MAX_BODY_BYTES:
            self._send_json(413 if body_size > MAX_BODY_BYTES else 400, {"error": "invalid_body_size"})
            return

        try:
            payload = json.loads(self.rfile.read(body_size))
            event, path, session_id, details = _parse_event(payload)
            if not _within_rate_limit(self.client_address[0]):
                raise RequestError(429, "rate_limit_exceeded")
            if not _send_activity_email(event, path, session_id, details):
                raise RequestError(503, "email_not_configured")
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid_json"})
            return
        except RequestError as error:
            self._send_json(error.status, {"error": error.code})
            return

        self._send_json(200, {"status": "sent"})

    def do_OPTIONS(self) -> None:
        self._send_json(405, {"error": "method_not_allowed"})


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("PORT", "8000"))
    except ValueError:
        raise SystemExit("PORT must be a valid integer") from None

    server = ThreadingHTTPServer((host, port), PulsePointHandler)
    server.daemon_threads = True
    print(f"Pulse Point server listening on http://{host}:{port}")
    print("Email status: configured" if _email_settings() else "Email status: SMTP credentials are not configured")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Pulse Point server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
