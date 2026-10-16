# Getting the app onto Android testers' phones

This covers the free, persistent path decided on for now: a real installable
`.apk` via EAS Build, plus `eas update` afterward so code changes reach
everyone who has it installed without a reinstall. iOS is intentionally not
covered here — it needs either a paid Apple Developer account or the
institutional TestFlight access you're checking on; see the conversation
that led here for why the free route (Expo Go) can't give iOS the same
"anyone, anywhere, anytime" result Android gets.

None of this can be run from the development session that prepared it — it
needs your own Expo account (free, no credit card) and runs from your own
machine. This is the exact sequence.

## One-time setup

1. Create a free account at [expo.dev](https://expo.dev) if you don't have
   one already.
2. In your local clone, inside the `mobile/` directory, log in:
   ```
   npx eas-cli login
   ```
3. Link this project to your account:
   ```
   npx eas-cli init
   ```
   This writes a project ID into `app.json` (`extra.eas.projectId`) — commit
   that change afterward so the link is reproducible from any clone.
4. Finish wiring up `expo-updates` (the package is already installed and
   pinned to `~29.0.20`, matching this project's Expo SDK 54 — this command
   fills in the remaining `app.json` fields, `updates.url` and
   `runtimeVersion`, that only your account can generate):
   ```
   npx eas-cli update:configure
   ```
   Commit the resulting `app.json` changes too.

## Point the build at your deployed backend

`eas.json`'s `preview` build profile has an `env.EXPO_PUBLIC_API_URL` entry
with a placeholder value. Before building, replace it with your actual
Render URL from `DEPLOY.md` (e.g. `https://bitback-xyz.onrender.com`) —
this is what gets compiled into the app so it talks to your real backend
instead of `localhost`, which would be unreachable from anyone else's phone.

## Build the installable Android app

```
npx eas-cli build --profile preview --platform android
```

This uploads to Expo's build servers and takes a few minutes. When it
finishes, it prints a download link and a QR code. That link is what you
share — anyone who opens it on an Android phone downloads a real `.apk`;
the phone will ask to confirm "install from unknown sources" the first
time (a standard Android security prompt for anything not from the Play
Store), and after that it's a real app icon that opens like any other app.
No Expo Go, no dev server, no laptop needed on your end once this is done.

## Pushing a code change afterward

Once someone has this build installed, you don't need a new `.apk` for
every change — only for changes to native configuration (a new native
dependency, a change to `app.json`'s native-facing fields). For everything
else — new screens, the survey logic, anything in your own JS/TSX code —
push it straight to everyone who already has the app:

```
npx eas-cli update --branch preview --message "describe what changed"
```

The app checks for updates automatically; testers don't have to do
anything for it to arrive.

## When you're ready for iOS

If the institutional TestFlight access comes through, the same `eas.json`
already has a `production` profile as a starting point — building for iOS
will additionally require Apple credentials, which `eas build --platform
ios` will walk you through providing once that account exists.
