# Deploying BitBack so the survey has a real public link

Everything up to now has run on `localhost`, which only ever worked on
whichever machine started the server. To actually field the survey — send
the link to people, get real responses instead of a local demo — the
backend needs to run somewhere with a public URL and a database that isn't
a temporary SQLite file on someone's laptop.

This guide uses **Render**, because as of August 2026 it's the option with
the most predictable cost for a small student project: the web service
itself is free indefinitely, and the only thing you pay for is the
database, at a flat $6/month. Railway is noted as an alternative at the
bottom, but no longer has an indefinite free tier — its Trial plan is a
one-time $5 credit, not a recurring free allowance, so it isn't free in the
same way Render's web service is.

None of this can be done from the development session that built this feature —
account creation, entering payment details, and clicking through a
provider's dashboard all require you, not an agent. This is the exact
sequence to run yourself.

## 1. Get the code somewhere Render can see it

Render deploys from a GitHub repository. If `feature/survey-instrument`
(or wherever this ended up) isn't pushed and merged into a branch you're
comfortable deploying from, do that first — see the earlier bundle-and-push
instructions if that part hasn't happened yet.

## 2. Create the database first

1. In the Render dashboard: **New +** → **PostgreSQL**.
2. Name it anything (e.g. `bitback-db`). Pick the region closest to you.
3. **Important — do not pick the free instance type.** Render's free
   Postgres is real, but it hard-deletes itself 30 days after creation.
   That's fine for a demo, but a genuine liability for survey data you're
   citing in an FYP report: if you forget to upgrade in time, the
   responses are just gone, unrecoverably. Pick **Basic · 256 MB** instead
   — $6/month, no expiry, and you can delete it the moment you're done
   collecting responses and have exported what you need.
4. Once it's created, copy the **External Database URL** shown on the
   database's page (starts with `postgres://` or `postgresql://`). You'll
   paste this into the web service in step 4.

## 3. Create the web service

1. **New +** → **Web Service**, connect the GitHub repo, pick the branch.
2. **Build Command:**
   ```
   pip install -r requirements.txt && alembic upgrade head
   ```
   (Running the migration as part of the build means the `survey_responses`
   table — and everything else — exists before the app ever starts.)
3. **Start Command:**
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. **Instance type:** Free is fine for a survey link. The real tradeoff:
   a free instance spins down after 15 minutes with no traffic, so the
   first visitor after a quiet stretch waits ~30-50 seconds for a cold
   start before the page loads. For a link you're sharing occasionally,
   that's a reasonable trade for $0/month. If that cold start would be
   embarrassing (e.g. sharing it live in a presentation), upgrade to
   Starter ($7/month) for the duration.

## 4. Environment variables

Set these on the web service (Render's **Environment** tab), matching what
`app/config.py` actually reads:

| Variable | Value | Why |
|---|---|---|
| `ENVIRONMENT` | `production` | Switches on production-only checks — notably the one below. |
| `DATABASE_URL` | the Postgres URL from step 2 | Without this it falls back to a local SQLite file, which does not persist on Render's ephemeral disk — every deploy would wipe it. |
| `SECRET_KEY` | a real random value — generate one with `python -c "import secrets; print(secrets.token_hex(32))"` | The app's own startup validator refuses to boot with `ENVIRONMENT=production` and the default dev secret, specifically so this can't be forgotten. |
| `DEMO_MODE` | `false` | **This is a real security fix, not a nice-to-have.** `DEMO_MODE=True` is the default, and it returns password-reset tokens directly in the API response so the flow can be demoed without an email provider — see the comment in `app/config.py`. Left on in production, anyone who knows a registered email can take over that account. |
| `CORS_ORIGINS` | leave default (`["*"]`) unless you're restricting it | The native app doesn't send an Origin header, so this mainly matters if you point a browser-based client at the API directly. Fine to leave open for a survey/demo deployment. |

## 5. Deploy and check it

Once the deploy finishes, Render gives you a URL like
`https://bitback-xyz.onrender.com`. Check two things:

- `https://bitback-xyz.onrender.com/survey/` loads the standalone web
  survey — this is the link to actually share.
- `https://bitback-xyz.onrender.com/api/survey/summary` returns a JSON
  aggregate (all zeros until responses come in) — confirms the API and
  database are wired up correctly.

That `/survey/` URL is what replaces `localhost` — it's the same page,
same mascot, same game, now reachable by anyone.

## 6. Pointing the mobile app at it (optional)

The in-app survey screen only needs this if you want testers using the
native app rather than the web link. Set `EXPO_PUBLIC_API_URL` to the
Render URL when starting Expo:

```
EXPO_PUBLIC_API_URL=https://bitback-xyz.onrender.com npx expo start
```

## 7. When you're done collecting responses

Export what you need (the `/api/survey/summary` endpoint, or a direct
`pg_dump` of the `survey_responses` table if you want the raw rows), then
delete the Postgres instance from the Render dashboard to stop the
$6/month charge. The free web service can just be left as-is or deleted —
it costs nothing either way.

## Alternative: Railway

Railway supports the same stack (FastAPI + Postgres) but its pricing
shape changed in 2026: there's no indefinite free plan anymore. The Trial
gives a one-time $5 credit with no recurring renewal, and the cheapest
ongoing option is the Hobby plan at $5/month, which bundles $5 of usage
credit — so for something this small, actual usage may stay within that
credit and the effective cost is close to the $5 subscription alone. It's
a reasonable alternative if you'd rather manage one bill instead of
Render's free-web-service-plus-paid-database split, but it's not
meaningfully cheaper for this project's traffic level.
