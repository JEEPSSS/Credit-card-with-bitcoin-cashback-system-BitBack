"""The privacy policy, served by the API it describes.

App Store review needs a public privacy policy URL, and the honest place to
keep one is next to the code: every statement below is about a model in
`app/models.py` or a call the server makes, so a change to what is stored is
a change in the same repository as the sentence that describes it.
"""
from html import escape

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

from app.config import settings

router = APIRouter(tags=["meta"])

LAST_UPDATED = "22 October 2026"


def _contact() -> str:
    if settings.support_email:
        email = escape(settings.support_email)
        return f'email <a href="mailto:{email}">{email}</a>'
    return "use the contact link on the app's store listing"


def _email_provider() -> str:
    if not settings.email_enabled:
        return ""
    return ("\n  <li><strong>Resend</strong> delivers password-reset emails. When you ask for"
            " one, it receives your email address and the message; nothing else.</li>")


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BitBack privacy policy</title>
<style>
  :root {{ --bg: #FAF9F7; --text: #1C1B19; --muted: #6B6862; --rule: #E4E1DC; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg: #0A0A0B; --text: #EDEBE8; --muted: #9A968F; --rule: #2A2826; }}
  }}
  body {{ background: var(--bg); color: var(--text); margin: 0;
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }}
  main {{ max-width: 680px; margin: 0 auto; padding: 48px 16px 80px; }}
  h1 {{ font-size: 31px; line-height: 1.2; margin: 0 0 4px; }}
  h2 {{ font-size: 20px; margin: 40px 0 8px; padding-top: 24px; border-top: 1px solid var(--rule); }}
  p, li {{ margin: 0 0 12px; }}
  .muted {{ color: var(--muted); }}
  table {{ border-collapse: collapse; width: 100%; font-size: 15px; }}
  th, td {{ text-align: left; vertical-align: top; padding: 8px 8px 8px 0;
           border-bottom: 1px solid var(--rule); }}
  th {{ font-weight: 600; }}
  a {{ color: inherit; }}
</style>
</head>
<body><main>
<h1>Privacy policy</h1>
<p class="muted">BitBack · last updated {updated}</p>

<p>BitBack is a final-year university project: a <strong>simulated</strong> credit card
that pays cashback in bitcoin. No real card is issued, no real payment is made, and no
real bitcoin moves. The data below is what the app actually stores to make that
simulation work.</p>

<h2>What we store about your account</h2>
<table>
  <tr><th>Data</th><th>Why</th></tr>
  <tr><td>Email address and display name</td><td>To sign you in and to show your name to you
    (and, on the referral leaderboard, to other signed-in users).</td></tr>
  <tr><td>Password</td><td>Stored only as a bcrypt hash. Nobody, including us, can read it back.</td></tr>
  <tr><td>Simulated purchases: amount, category, merchant name you typed, time, and the
    bitcoin price at that moment</td><td>To calculate your cashback and show your statement,
    spending breakdown, forecast and recap.</td></tr>
  <tr><td>Rewards, wallet balance and wallet history (in satoshis)</td><td>To show what you
    have earned and where it went.</td></tr>
  <tr><td>Streaks, badges, level, active boost</td><td>The rewards features.</td></tr>
  <tr><td>Savings goals, round-up and auto-withdraw settings, including any bitcoin address
    you enter</td><td>The features you set them up for. Nothing is ever sent to that address.</td></tr>
  <tr><td>Referral code, and who referred whom</td><td>To pay referral bonuses.</td></tr>
  <tr><td>Price alerts and in-app notifications</td><td>To tell you when bitcoin crosses a
    price you chose.</td></tr>
  <tr><td>Two-factor secret and backup codes, if you turn two-factor on</td><td>To check your
    sign-in codes.</td></tr>
  <tr><td>A fraud risk score for each simulated purchase, and the features it was computed
    from</td><td>The fraud-protection feature, which compares each purchase with your own
    history. It runs on our server and is not shared.</td></tr>
</table>

<h2>What we do not collect</h2>
<ul>
  <li>No location, contacts, photos, or device identifiers.</li>
  <li>No real card numbers or bank details.</li>
  <li>No advertising or analytics SDKs: the app contains no third-party tracking code.</li>
</ul>
<p>Your IP address is used briefly in memory to rate-limit sign-in attempts and is not
written to our database. Our hosting provider may keep it in standard server logs.</p>

<h2>The research survey</h2>
<p>The optional survey is anonymous and stored separately from accounts: a response is
not linked to your email or any account. Free-text answers are used in the project report
and are never published through the app.</p>

<h2>Who else handles data</h2>
<ul>
  <li><strong>Render</strong> runs the server and <strong>Neon</strong> hosts the database.
    They store the data above on our behalf.</li>
  <li><strong>Expo</strong> delivers app updates. The app tells Expo its version and
    platform to fetch them; no account data is sent.</li>
  <li><strong>CoinGecko</strong> and <strong>Coinbase</strong> supply the bitcoin price.
    Our server asks for the price; nothing about you is sent.</li>{email_provider}
</ul>
<p>We do not sell or share your data with anyone else.</p>

<h2>Keeping and deleting it</h2>
<p>Your data is kept while your account exists. To delete it, open
<strong>More → Delete account</strong> in the app and confirm with your password. That
removes your account and every record listed above immediately; it cannot be undone.
Referral bonuses already paid to another user stay with them.</p>

<h2>Contact</h2>
<p>For anything about this policy or your data, {contact}.</p>
</main></body>
</html>
"""


@router.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
def privacy_policy() -> str:
    return PAGE.format(updated=LAST_UPDATED, contact=_contact(),
                       email_provider=_email_provider())
