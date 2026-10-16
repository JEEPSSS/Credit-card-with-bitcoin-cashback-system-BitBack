# Deploying BitBack so the survey has a real public link

Everything up to now has run on `localhost`, which only ever worked on
whichever machine started the server. To actually field the survey — send
the link to people, get real responses instead of a local demo — the
backend needs to run somewhere with a public URL and a database that isn't
a temporary SQLite file on someone's laptop.

This guide gets you to **$0/month**: **Render** for the app (its web
service is free indefinitely) and **Neon** for the database. Render's own
Postgres has a free tier too, but it hard-deletes itself 30 days after
creation — fine for a demo, not for something you're citing as real FYP
data. Neon's free plan is explicitly permanent (Neon's own words: "not a
trial, no credit card required"), so it's the piece that makes this whole
stack free without a 30-day countdown hanging over your dataset. Splitting
app and database across two providers is completely normal for this kind
of stack — Render itself expects it, which is why "External Database URL"
is a field it asks for rather than assuming its own Postgres.

(Paid options — Render's own $6/month Postgres, or Railway's $5/month Hobby
plan — are noted at the bottom in case Neon's limits ever don't fit, but
you shouldn't need them for a survey.)

None of this can be done from the development session that built this feature —
account creation, entering payment details, and clicking through a
provider's dashboard all require you, not an agent. This is the exact
sequence to run yourself.

## 1. Get the code somewhere Render can see it

Render deploys from a GitHub repository. If `feature/survey-instrument`
(or wherever this ended up) isn't pushed and merged into a branch you're
comfortable deploying from, do that first — see the earlier bundle-and-push
instructions if that part hasn't happened yet.

## 2. Create the database first — on Neon, not Render

1. Go to [neon.com](https://neon.com) and sign up (no credit card required
   for the free plan).
2. Create a new project (e.g. `bitback`). Neon creates a default database
   and branch automatically — you don't need to configure anything else.
3. On the project's dashboard, copy the **connection string** — it looks
   like `postgresql://user:password@ep-something.neon.tech/dbname?sslmode=require`.
   Keep the `?sslmode=require` on the end; Neon requires TLS and some
   Postgres drivers don't assume it by default. You'll paste this whole
   string into the web service in step 4.

What you're trading for $0: Neon's free plan gives 0.5 GB of storage and
100 compute-hours a month, and the database "autosuspends" after 5 minutes
of no queries — the *first* request after a quiet stretch takes a little
longer while it wakes back up, then it's normal speed. None of that costs
anything or has a countdown; unlike Render's free Postgres, there's no
30-day deletion. For a few weeks of survey traffic this is nowhere near
the limits.

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
| `DATABASE_URL` | the Neon connection string from step 2, including `?sslmode=require` | Without this it falls back to a local SQLite file, which does not persist on Render's ephemeral disk — every deploy would wipe it. |
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
`pg_dump` of the `survey_responses` table using the Neon connection string
if you want the raw rows). Nothing needs to be deleted to stop a
charge — both pieces are free — but you can delete the Neon project and
the Render service afterward if you'd rather not leave them sitting there.

## Paid alternatives, if Neon's limits ever don't fit

- **Render's own Postgres, Basic · 256 MB ($6/month):** simpler in that
  everything lives in one dashboard, and you skip the sub-second
  autosuspend wake-up on the first request after idle time. Reasonable if
  you'd rather pay a small flat fee than deal with a second provider.
- **Railway:** supports the same stack, but its pricing shape changed in
  2026 — there's no indefinite free plan anymore. The Trial gives a
  one-time $5 credit with no recurring renewal, and the cheapest ongoing
  option is the Hobby plan at $5/month (which bundles $5 of usage credit,
  so light traffic may cost close to just the subscription). Not free, but
  keeps app + database on one bill.
