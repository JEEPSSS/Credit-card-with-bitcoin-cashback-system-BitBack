"""The page a password-reset email links to.

A web page rather than an app deep link, because mail clients commonly refuse
to open custom schemes such as `bitback://`, and because the person may be
reading the email on a computer. The page posts to the same
`/api/auth/reset-password` endpoint the app uses, and offers to open the app
for anyone reading on their phone.

The token arrives in the URL fragment, which the browser never sends to the
server, so this route serves the same static page to everyone and the token
never appears in a request log.
"""
from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["meta"])

PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Reset your BitBack password</title>
<style>
  :root { --bg: #FAF9F7; --text: #1C1B19; --muted: #6B6862; --rule: #D6D2CC;
          --field: #FFFFFF; --accent: #F7931A; --error: #B3261E; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0A0A0B; --text: #EDEBE8; --muted: #9A968F; --rule: #3A3836;
            --field: #161618; --error: #F2B8B5; }
  }
  body { background: var(--bg); color: var(--text); margin: 0;
         font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
  main { max-width: 420px; margin: 0 auto; padding: 48px 16px 80px; }
  h1 { font-size: 28px; line-height: 1.2; margin: 0 0 8px; }
  p { margin: 0 0 16px; }
  .muted { color: var(--muted); }
  label { display: block; font-weight: 600; margin: 16px 0 4px; }
  input { box-sizing: border-box; width: 100%; min-height: 48px; padding: 10px 12px;
          font: inherit; color: var(--text); background: var(--field);
          border: 1px solid var(--rule); border-radius: 8px; }
  button, .app { display: block; box-sizing: border-box; width: 100%; min-height: 48px;
                 margin-top: 24px; font: inherit; font-weight: 600; border-radius: 8px;
                 text-align: center; text-decoration: none; cursor: pointer; }
  button { border: 0; background: var(--accent); color: #1C1B19; }
  button:disabled { opacity: .6; cursor: default; }
  .app { padding: 11px; border: 1px solid var(--rule); color: var(--text); }
  #error { color: var(--error); min-height: 1.6em; margin-top: 12px; }
  [hidden] { display: none !important; }
</style>
</head>
<body><main>
<h1 id="title">Choose a new password</h1>

<form id="form" hidden>
  <p class="muted">At least 8 characters. Changing it signs you out on every device.</p>
  <label for="pw">New password</label>
  <input id="pw" type="password" autocomplete="new-password" minlength="8" required>
  <label for="confirm">Confirm new password</label>
  <input id="confirm" type="password" autocomplete="new-password" minlength="8" required>
  <button id="submit" type="submit">Update password</button>
  <p id="error" role="alert"></p>
  <a id="app" class="app" href="#">Open in the BitBack app instead</a>
</form>

<div id="done" hidden>
  <p>Sign in to BitBack with your new password.</p>
</div>

<div id="missing" hidden>
  <p>This link is incomplete. Open the link from the email again, or ask the app for
  a new one under <strong>Forgot password</strong>.</p>
</div>
</main>
<script>
(function () {
  var token = new URLSearchParams(location.hash.slice(1)).get("token");
  // Drop the token from the address bar and history once it has been read.
  history.replaceState(null, "", location.pathname);
  if (!token) { document.getElementById("missing").hidden = false; return; }

  var form = document.getElementById("form");
  var error = document.getElementById("error");
  var submit = document.getElementById("submit");
  form.hidden = false;
  document.getElementById("app").href =
    "bitback://reset-password?token=" + encodeURIComponent(token);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var pw = document.getElementById("pw").value;
    if (pw !== document.getElementById("confirm").value) {
      error.textContent = "The two passwords do not match.";
      return;
    }
    error.textContent = "";
    submit.disabled = true;
    fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token, new_password: pw })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (r.ok) {
          form.hidden = true;
          document.getElementById("title").textContent = "Password updated";
          document.getElementById("done").hidden = false;
          return;
        }
        error.textContent = typeof body.message === "string" ? body.message
          : "That did not work. Check the password and try again.";
      });
    }).catch(function () {
      error.textContent = "Could not reach the server. Check your connection and try again.";
    }).finally(function () { submit.disabled = false; });
  });
})();
</script>
</body>
</html>
"""


@router.get("/reset-password", response_class=HTMLResponse, include_in_schema=False)
def reset_password_page() -> HTMLResponse:
    return HTMLResponse(PAGE, headers={"Cache-Control": "no-store",
                                       "Referrer-Policy": "no-referrer"})
