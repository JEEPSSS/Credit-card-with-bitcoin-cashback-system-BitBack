# Setup checklist

Everything needed to run BitBack is in this folder. Nothing else is downloaded
from anywhere except the public pip and npm registries.

## You need installed on your machine

| Tool | Version | Check with |
|---|---|---|
| Python | 3.10 or newer | `python --version` |
| Node.js | 20 or newer | `node --version` |
| Expo Go app | latest | iOS App Store / Google Play |

Postgres is optional. Without it the backend uses SQLite and creates
`bitback.db` in this folder on first run.

## 1. Backend

```bash
pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and replace `SECRET_KEY` with any long random string. Then:

```bash
python seed_demo.py
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Confirm it works: open `http://localhost:8000/docs` in a browser. You should see
all 47 endpoints. Leave this terminal running.

`--host 0.0.0.0` is not optional. Bound to the default `127.0.0.1`, the server
only accepts connections from the same machine and your phone cannot reach it.

## 2. Mobile app

In a second terminal:

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS).

Your laptop and phone must be on the same Wi-Fi network. University networks
often block device-to-device traffic — if the app loads but every screen shows a
connection error, tether your laptop to your phone's hotspot instead. That is
also the safest setup for a live demo, because it does not depend on the venue's
network.

Demo login: `demo@bitback.app` / `demo12345`

## 3. Confirm it all works

```bash
python test_api.py
```

Expect `47 passed, 0 failed`.

## Things that commonly go wrong

**`npm install` fails on a version.** The Expo SDK moves quickly and a pinned
version may have been superseded. Every dependency in `mobile/package.json` is
currently aligned to Expo SDK 57 (React Native 0.86.2) and installs cleanly with
a plain `npm install` — no `--legacy-peer-deps` needed. If a future SDK bump
breaks it again, run `npx expo install --fix`, which rewrites every dependency
to the version matching your installed SDK.

Two things are load-bearing and easy to undo by accident:

- `react` is a caret range (`^19.2.3`), not an exact pin. Expo's dev log-box
  pulls in a `react-dom` that requires a newer patch than the SDK's nominal
  `19.2.3`; an exact pin makes npm fail to resolve.
- `babel-preset-expo` is declared in `devDependencies` even though `expo`
  already depends on it. Without the explicit entry npm nests it under
  `node_modules/expo/`, where the root `babel.config.js` cannot resolve it and
  Metro fails with `Cannot find module 'babel-preset-expo'`.

**Every screen shows a connection error.** The app derives the API address from
the host Expo is serving on. If that guess is wrong, find your machine's LAN IP
(`ipconfig` on Windows, `ifconfig | grep inet` on macOS/Linux) and create
`mobile/.env` containing:

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:8000
```

Restart with `npx expo start --clear`.

**Bitcoin price shows a round number and never moves.** CoinGecko's free API is
rate limited and the backend falls back to a fixed price when the call fails.
This is deliberate — a rate limit should not break a transaction mid-demo.

**Styles look wrong after editing config.** Metro caches aggressively. Stop it
and run `npx expo start --clear`.

## Using Postgres instead of SQLite

```bash
createdb bitback
```

Then in `.env`:

```
DATABASE_URL=postgresql://youruser:yourpassword@localhost:5432/bitback
```

Delete `bitback.db`, re-run `python seed_demo.py`, and restart. Tables are
created automatically on startup.

## What is not built

- No real Bitcoin transactions. Withdrawal addresses are stored but nothing is
  broadcast to any network, and no private keys exist anywhere in the codebase.
- No email delivery. Password reset returns the token in the API response so the
  flow is demonstrable without a mail server.
- No app icon or splash image. Expo's defaults are used. Drop `icon.png` (1024x1024)
  and `splash.png` into `mobile/assets/` and reference them in `app.json` if you
  want branded ones for the demo.
