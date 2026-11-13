# Getting the app onto Android testers' phones

This covers the free, persistent path decided on for now: a real installable
`.apk` via EAS Build, plus `eas update` afterward so code changes reach
everyone who has it installed without a reinstall. The iPhone app is
distributed through TestFlight; how to update it is at the end.

Run these steps on your own machine using your Expo account (free, no
credit card required). Follow the sequence below.

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

`eas.json` sets `EXPO_PUBLIC_API_URL` once, in a `base` profile that both
`preview` and `production` extend. It is compiled into the app, so it must be
your Render URL (currently `https://bitcoin-survey.onrender.com`); if the
service moves, change it there and rebuild. Before this, only `preview` set it,
so a `production` build would have called `http://localhost:8000` - which, on
anyone's phone, is the phone.

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

## Updating the iPhone app (TestFlight)

The iPhone app is a TestFlight build made with the `production` profile, so
it listens on the `production` update channel (runtime 1.0.0). It gets code
changes the same way the APK does, just on a different branch.

**Changes to your own JS/TSX code** (screens, styling, logic). First check
that the native side has not changed since the TestFlight build, using that
build's ID from `npx eas-cli build:list --platform ios --limit 1`:

```
npx eas-cli fingerprint:compare --build-id <iOS build ID>
```

If it reports that the fingerprints match, publish:

```
npx eas-cli update --branch production --platform ios --message "describe what changed"
```

On the iPhone, open BitBack, close it fully, and open it again: the app
downloads the update on the first start and runs it from the next. The build
line at the foot of More shows which update it is running.

To undo, note the current update's group ID before publishing
(`npx eas-cli update:list --branch production --limit 3`) and republish it
afterwards with `npx eas-cli update:republish --group <group ID>`.

**Native changes** (a new native dependency, or native fields in `app.json`),
or when the fingerprints do not match: make a new build and send it to
TestFlight. This needs the Apple account the first build was made with.

```
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

When Apple has processed it (usually under an hour), the TestFlight app on the
iPhone shows **Update** next to BitBack.
