"""Password-reset email, sent through Resend's HTTP API.

One provider and one message, so a plain HTTPS call rather than an SDK. The
send runs after the response has gone out (FastAPI background task), which
keeps the forgot-password response time the same whether or not the address
has an account: a slow provider call only for real accounts would let a caller
tell them apart by timing.

The token goes in the link's fragment (`#token=...`), not its query string.
Browsers never send the fragment to the server, so the token does not land in
Render's request logs or in a Referer header.
"""
import logging
from html import escape

import httpx

from app.config import settings

log = logging.getLogger("bitback.email")

RESEND_URL = "https://api.resend.com/emails"
TIMEOUT_SECONDS = 10


def reset_link(token: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/reset-password#token={token}"


def _send(to: str, subject: str, text: str, html: str) -> bool:
    try:
        r = httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to],
                  "subject": subject, "text": text, "html": html},
            timeout=TIMEOUT_SECONDS,
        )
    except httpx.HTTPError as e:
        # Never log the address or the body: the body carries a live token.
        log.warning("email send failed: %s", type(e).__name__)
        return False
    if r.status_code >= 300:
        log.warning("email send rejected: HTTP %s", r.status_code)
        return False
    return True


def send_password_reset(to: str, token: str, minutes: int) -> bool:
    link = reset_link(token)
    text = (
        "Someone asked to reset the password for your BitBack account.\n\n"
        f"Choose a new password here: {link}\n\n"
        f"The link works once and expires in {minutes} minutes. "
        "If you did not ask for this, ignore this email; your password has not changed.\n"
    )
    safe = escape(link, quote=True)
    html = (
        '<div style="font-family:-apple-system,Segoe UI,Inter,sans-serif;'
        'font-size:16px;line-height:1.6;color:#1C1B19;max-width:520px">'
        "<p>Someone asked to reset the password for your BitBack account.</p>"
        f'<p><a href="{safe}" style="display:inline-block;background:#F7931A;color:#1C1B19;'
        'padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">'
        "Choose a new password</a></p>"
        f"<p>The link works once and expires in {minutes} minutes. If you did not ask for "
        "this, ignore this email; your password has not changed.</p>"
        f'<p style="color:#6B6862;font-size:14px">If the button does not work, open this '
        f'address: <br><a href="{safe}" style="color:#6B6862">{escape(link)}</a></p>'
        "</div>"
    )
    return _send(to, "Reset your BitBack password", text, html)
