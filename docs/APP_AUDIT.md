# App audit: accessibility, usability, model explanations, security, performance, release

An audit of the BitBack mobile app (`mobile/`) carried out on 18 October 2026, the
fixes made as a result, and what still needs a device or real users to settle.
The backend's own audit is [BACKEND_HARDENING.md](BACKEND_HARDENING.md) and is
not repeated here. The prompts that drive an audit like this one are in
[REVIEW_PROMPTS.md](REVIEW_PROMPTS.md).

## Method

**Standards.** Each area was checked against a published source, listed in
[Sources](#sources). Throughout, *the source says* marks the published guidance;
*recommendation* marks a judgement specific to BitBack.

**How each source was read.** This environment's network policy blocked
w3.org, mas.owasp.org, docs.expo.dev, reactnative.dev, nngroup.com and gov.uk.
The W3C, OWASP, Expo and React Native pages were read from the
repositories they are published from (w3c/wcag, OWASP/owasp-masvs,
OWASP/owasp-mastg, expo/expo, facebook/react-native-website), and
developer.android.com directly. The NN/g and GOV.UK pages could only be seen
through search-result summaries; claims taken from them are marked so, and
should be checked against the pages before the report cites them.

**Evidence.** A result is *Pass* or *Fail* only with evidence: a file and line,
a computed value, or a command and its output. Anything that needs a phone, a
screen reader or a person to observe is *Unverified*, never Pass.

**Severity.** Nielsen's 0-4 scale: 0 not a problem, 1 cosmetic, 2 minor,
3 major, 4 catastrophe.

**Limits of the method.** One evaluator, reading code, with no device. A
heuristic evaluation by one person finds a fraction of the problems several
independent evaluators would (NN/g recommends several evaluators working
independently, then pooling; seen via search summary only), and the source is
explicit that it does not replace testing with users. MASTG says the same of
security: the controls below were checked by reading the code (static
review), not by testing the installed app, so none of this is a claim that the
app complies with MASVS.

## Results at a glance

| ID | Area | Standard item | Before | Sev. | Status |
|----|------|---------------|--------|------|--------|
| S1 | Security | MASVS-AUTH-1; Nielsen #5 | Every install pre-filled the demo account's email and password, so testers shared one live account that any of them could lock with 2FA or delete | 3 | Fixed in app; server-side guard recommended |
| P1 | Performance | RN performance; Android launch time | Icon library was 28.8% of the JS bundle: 1,638 icons shipped, 47 used | 2 | Fixed: bundle −25% |
| T1 | Model claims | Nielsen #2; trust | "Five models" on two screens; four exist | 2 | Fixed |
| T2 | Model claims | Nielsen #2; trust | "80% likely between X and Y": held-out coverage was 70-74% for rising or falling spending | 2 | Fixed: wording states measured coverage |
| T3 | Model claims | Nielsen #2 | "Protection score" read as how safe the account is; it is the share of transactions not flagged | 2 | Fixed: defined on screen |
| T4 | Model claims | Nielsen #2, #10 | Flagged transactions listed raw model inputs ("9.21", "0.97") and "iforest-v3" | 2 | Fixed: plain language |
| E1 | Errors | WCAG 3.3.1; Nielsen #9 | Forgot-password, alert create and delete, goal delete, round-up and mark-all-read failed silently | 3 | Fixed |
| E2 | Errors | WCAG 4.1.3 | No error message was announced to a screen reader when it appeared | 2 | Fixed |
| E3 | Errors | WCAG 3.3.4; Nielsen #3, #5 | Goals and price alerts deleted on the first tap | 2 | Fixed: confirmation |
| A1 | Accessibility | WCAG 1.4.3 | Placeholder text 2.06:1 on fields | 2 | Fixed: 4.76:1 |
| A2 | Accessibility | WCAG 1.4.11 | Text field edges 1.38:1 against the field | 2 | Fixed: 3.50:1 |
| A3 | Accessibility | WCAG 4.1.2 | Radio buttons exposed `selected`, which a radio does not announce; survey options exposed no state | 2 | Fixed |
| A4 | Accessibility | WCAG 1.4.1, 1.3.1 | Boost rows told "now" and "boosted" rates apart by colour only; spoken name omitted both | 2 | Fixed |
| A5 | Accessibility | WCAG 1.4.4 | Balance odometer clipped its digits at large system text sizes | 2 | Fixed |
| A6 | Accessibility | WCAG 1.3.5; Android Autofill_Hints | No autofill hints on email, password, name or one-time-code fields | 2 | Fixed |
| A7 | Accessibility | WCAG 1.3.1 | No screen headings exposed as headings | 1 | Fixed |
| A8 | Accessibility | WCAG 4.1.2 | Sign-in links and "See all" had no role | 1 | Fixed |
| A9 | Accessibility | Android Touch_Target_Size (48 dp) | Chips, presets, period tabs and text links 33-41 dp tall | 1 | Fixed: 48 dp touch area |
| U1 | Usability | Nielsen #1 | "Copy key" gave no sign it had copied | 1 | Fixed |
| U2 | Usability | Nielsen #9 | Invalid amount left a greyed-out button with no reason | 1 | Fixed |
| R1 | Release | EAS Update debugging | No way to see on a phone which update it runs | 2 | Fixed: build info on More |
| C3 | Security | MASVS-CODE-3 | `npm audit`: 43 advisories (25 high, 18 moderate) | 2 | Not fixed: needs an Expo SDK major upgrade |
| D1 | Design | Android Theme_Support | Dark theme only | 1 | Not fixed: documented |

Two problems were rated severity 3 (S1 and E1) and none severity 4; both are
fixed in the app.

## 1. Accessibility: WCAG 2.2 AA and Android accessibility

### Contrast (WCAG 1.4.3 text 4.5:1, 1.4.11 non-text 3:1)

Computed with the WCAG relative-luminance formula for every text colour on
every surface in `mobile/lib/theme.ts`. A test now recomputes the field and
text pairs (`mobile/lib/format.test.ts`, "contrast of the text and field
tokens") so a token change cannot silently fail them.

| Text colour | canvas | surface (cards, fields) | raised | elevated |
|-------------|-------:|------------------------:|-------:|---------:|
| text `#F2F0EC` | 17.39 | 16.16 | 15.27 | 14.12 |
| bright `#C9C3BC` | 11.33 | 10.52 | 9.94 | 9.20 |
| muted `#97918B` | 6.35 | 5.90 | 5.58 | 5.16 |
| primary `#F7931A` | 8.62 | 8.01 | 7.57 | 7.00 |
| success `#35A56A` | 6.36 | 5.90 | 5.58 | 5.16 |
| danger `#E05252` | 5.18 | 4.81 | 4.55 | **4.21** |
| placeholder, before (`subtle #4D4946`) | 2.22 | **2.06** | 1.95 | 1.80 |
| placeholder, after (`faint #86817B`) | 5.13 | 4.76 | 4.50 | 4.16 |
| field edge, before (`border #322F2D`) | 1.49 | **1.38** | - | - |
| field edge, after (`outline #716B66`) | 3.77 | 3.50 | 3.31 | 3.06 |

- **A1 (fixed).** Placeholders such as "name@email.com" were 2.06:1 on a field.
  The source says 1.4.3 applies to all text, and placeholders carry information
  here. New token `faint`, 4.76:1 (`mobile/lib/theme.ts`).
- **A2 (fixed).** A text field was a near-black box on a near-black page,
  edged at 1.38:1. The source says the visual information needed to identify a
  component needs 3:1 (1.4.11). New token `outline`, 3.50:1, on every text
  field (`mobile/components/Field.tsx`, the amount field in `simulate.tsx`).
- `danger` on `elevated` is 4.21:1. No screen puts red text on that surface
  today; recommendation: keep it that way, or lighten danger to `#EA6A6A`
  (5.18:1).
- The theme's own comments overstated three ratios (muted "5.8:1", text
  "16.4:1", on-primary "12.1:1"); corrected to the computed values.
- Category colours are 4.77-8.32:1 on the canvas, above the 3:1 non-text
  minimum. Android's guidance gives the same thresholds (4.5:1 under 18 sp, or
  under 14 sp bold; 3:1 otherwise).

### Other criteria

| Criterion | Result | Evidence and change |
|-----------|--------|---------------------|
| 1.1.1 Non-text content | Pass | Icons sit beside text; icon-only buttons (back, bell, delete alert) have labels (`components/ui.tsx`, `app/(tabs)/index.tsx`, `app/alerts.tsx`). The decorative "₿" on sign-in is now hidden from screen readers. |
| 1.3.1 Info and relationships | **Fixed (A7)** | Screen titles and section labels now carry `accessibilityRole="header"`, so a screen reader can move by heading (`components/ui.tsx`). |
| 1.3.5 Identify input purpose | **Fixed (A6)** | `autoComplete` and iOS `textContentType` on email, current and new password, name and one-time code. The source for Android (core app quality, Autofill_Hints) asks for the same. |
| 1.4.1 Use of colour | **Fixed (A4)** | Boost rows showed the base and boosted rates as two stacked numbers, grey and orange. Now "1.5% → 3.0%" with an "Active" label (`app/(tabs)/boosts.tsx`). Price change, risk bands and password strength already had text. |
| 1.4.4 Resize text | **Fixed (A5)**; rest Unverified | The odometer sized its digit window from the unscaled font, so system text scaling clipped the balance. Now `scaledLineHeight` (theme) grows the window with `fontScale`, capped at 1.6× with the text held to the same cap; tested. Other fixed-height text (tab bar labels) needs checking on a phone at 200%. |
| 2.3.3 Animation from interactions | Pass (AAA, beyond the AA target) | Odometer, skeleton and survey honour reduce-motion (`lib/useReducedMotion.ts`); Reanimated layout animations follow the system setting by default. |
| 2.5.8 Target size (minimum), 24×24 | Pass, from styles | Smallest was the privacy link, about 33 pt tall by its padding and line height; not measured on a device. |
| Android Touch_Target_Size, 48 dp | **Fixed (A9)** | 40 pt chips, presets and period tabs get 4 pt of hit area above and below (`CONTROL_HIT_SLOP`); history chips 6 pt; sign-in links, privacy and delete-account links a 48 pt minimum height; alert direction toggles 48 pt. |
| 3.3.1 Error identification | **Fixed (E1)** | See section 2. Field errors are now red, read with the field (`accessibilityHint`) and announced. |
| 3.3.4 Error prevention (data) | **Fixed (E3)** | Deleting a goal or alert asks first; the goal prompt says how many sats return to the wallet. Transactions already showed a preview before "Confirm"; account deletion already asked and required the password. |
| 3.3.8 Accessible authentication | Pass | No cognitive test; paste allowed into the password and code fields; autofill now possible. |
| 4.1.2 Name, role, value | **Fixed (A3, A8)** | Radios used `selected`, which a radio does not report, so TalkBack read every option as unchecked; now `checked`, inside a `radiogroup` (transact, alerts, round-up, survey). Survey choices and Likert options now report their state. Sign-in links and "See all" now have the link role. |
| 4.1.3 Status messages | **Fixed (E2)** | `ErrorNote` and the new `InlineError` are announced when they appear (`accessibilityRole="alert"`, live region). |

## 2. Usability: Nielsen's ten heuristics

One evaluator, reading the code of all 23 screens. Screens with forms, money or
model output were read line by line; recap, referral, profile and
notifications were checked for error handling, roles and labels only.
Findings at severity 1 or above:

| # | Heuristic | Screen | Finding | Sev. | Change |
|---|-----------|--------|---------|------|--------|
| S1 | 5 Error prevention | Sign in | The demo account's password was pre-filled in every build (`login.tsx`), and that account exists on the live server (checked: it signs in). Every tester who tapped "Sign in" shared it, and any one of them could turn on 2FA or delete it for everyone. | 3 | Pre-filled in development builds only (`__DEV__`); "Sign in" disabled until both fields are filled. Recommendation: block 2FA, password change and deletion for the demo account on the server. |
| E1 | 9 Recover from errors | Forgot password, Price alerts, Goals, Round-up, Notifications | A failed request did nothing visible. Forgot-password had no `catch`; alert create and delete were bare `await`s in `onPress`; the goal-delete and mark-all-read errors were stored but never shown; a failed round-up save sprang the switch back with no reason. | 3 | Each now shows the server's message next to the control. |
| E3 | 3 User control; 5 Error prevention | Goals, Price alerts | Delete acted on the first tap. Goal delete also spun every card's Delete button at once. | 2 | Confirmation dialog; spinner only on the goal being deleted. |
| T1-T4 | 2 Match with the real world | AI insights, Fraud, More | See section 3. | 2 | Rewritten. |
| U2 | 9 Recover from errors | Transact | Typing "0" or "abc" greyed out "Confirm" with no reason. | 1 | "Enter an amount above $0." |
| U1 | 1 Visibility of system status | Security | "Copy key" for the 2FA secret gave no feedback. | 1 | Button reads "Copied". |
| - | 4 Consistency | Several | Errors were shown four different ways (card, red text, plain text, none). | 1 | Two components: `ErrorNote` for a failed screen, `InlineError` for a failed action. |
| - | 1 Visibility of system status | Every screen | Pass: the wake banner explains the cold-start wait; data screens show a skeleton or a retryable error (`components/ui.tsx`, `Async`). | - | - |
| - | 3 User control | Boosts, Delete account | Pass: replacing a boost and deleting the account both confirm first. | - | - |

## 3. Model explanations and user trust

The other prompt pack's point stands: plain wording does not make a claim
true. Each statement the app makes about a model was checked against the code
and `evaluation/results.json`.

| Where | The app said | The code or evaluation says | Verdict | Now says |
|-------|--------------|-----------------------------|---------|----------|
| AI insights header; More | "Five models" / "All five models" | Four: Isolation Forest, the forecast blend, expected-value boost ranking, nearest-centroid persona (`app/ai-insights.tsx` `MODELS`) | Wrong | "Four models" |
| Forecast card | "80% likely between X and Y" | The interval targets 80% (`Z_80`, `INTERVAL_SCALE` in `app/ml_forecast.py`). Held-out coverage, 30 seeds: stationary 0.817, declining 0.742, growing 0.700 | Overstated for changing spending | "Likely range X to Y", with: "set to contain the real figure 80% of the time. In testing it did for steady spending, but only 70 to 74% of the time when spending was rising or falling." |
| Forecast card | "An even blend of the two" | `LEVEL_WEIGHT = 0.5` | Correct | Unchanged |
| Fraud | "Protection score" | `100 − flagged / scored × 100` (`get_fraud_summary`) | Misleading name | Kept, with "N% of your scored transactions were not flagged" under it |
| Fraud | "Once you have enough history the model trains on your own transactions" | Needs 50 training rows, each with 20 earlier purchases (`MIN_TRAIN_SIZE`, `MIN_CONTEXT`): about the 70th purchase | Vague | "From about your 70th purchase" |
| Fraud | "across six features"; "a score of 56 or above" | `FEATURE_NAMES` has six; `ANOMALY_THRESHOLD = 56` | Correct | Threshold now read from `RISK_FLAG_THRESHOLD`, not typed in |
| Fraud | (no accuracy stated) | 30 held-out seeds: recall 0.963, precision 0.830, false-positive rate 0.008 | Missing | "caught 96% of planted fraud and about one flag in six was a false alarm: a clean score is not a guarantee, and a flag is not proof" |
| Flagged transaction | "Amount vs your average for this category 2.41", "Gap since your last transaction 9.21", "iforest-v3" | The model's inputs: a z-score, log(seconds + 1), a 0-1 surprisal | Correct but meaningless to a cardholder | "Higher than usual", "3 h", "Unusual for you", "Scored by your personal model" (`fraudFeature`, `scoredBy` in `lib/format.ts`, 8 tests) |
| Persona | "Confidence 77%" | Expected calibration error 0.026 overall, 0.040 at 20 purchases | Supported | Unchanged |
| Boosts | "Double the cashback ... for 30 days" | `BOOST_MULTIPLIER = 2.0`, `BOOST_DURATION_DAYS = 30` | Correct | Unchanged |
| `theme.ts` comment | "the backend's ANOMALY_THRESHOLD of 60" | 56 | Stale | Corrected |

## 4. Security and privacy: OWASP MASVS v2 (static review only)

| Control | Result | Evidence |
|---------|--------|----------|
| STORAGE-1 stores sensitive data securely | Pass | The session token is in `expo-secure-store` (Keystore/Keychain), not AsyncStorage (`lib/api.ts`, `tokenStore`). Nothing else sensitive is stored on the device. |
| STORAGE-2 prevents leakage | Pass, one note | No `console` calls in app code. The 2FA secret goes to the clipboard when the user taps Copy, which is the purpose of the button. |
| CRYPTO-1, CRYPTO-2 | Not applicable | The app does no cryptography of its own; hashing and tokens are server-side. |
| AUTH-1 secure authentication | Pass in app; see S1 | Server-side controls are in BACKEND_HARDENING.md. The shared demo account (S1) was the app's part of the problem. |
| AUTH-2 local authentication | Not implemented | No biometric unlock. Android core app quality lists Biometric_Authentication for apps that protect financial data: a recommendation for a real card product. |
| AUTH-3 additional authentication for sensitive operations | Pass | Deleting the account re-asks for the password; turning off 2FA asks for a code. |
| NETWORK-1 secures all traffic | Pass for release builds; Unverified on the APK | The release profile sets an `https://` API URL (`eas.json`). The `http://` fallback is only for a development server on the LAN. No network security config is declared; checking the built manifest for cleartext settings needs the APK. |
| NETWORK-2 identity pinning | Not implemented | Would need a native module and a new build. |
| PLATFORM-1, -2 IPC and WebViews | Pass | No WebView; the privacy policy opens in the browser. |
| PLATFORM-3 secure UI | Partial | The 2FA secret and backup codes can be screenshotted. Blocking that needs a native module and a new build. |
| CODE-2 enforces updates | Partial | EAS Update fetches new JavaScript on launch; nothing forces a new binary. |
| CODE-3 no known-vulnerable components | **Fail, not fixed (C3)** | `npm audit --omit=dev`: 43 advisories, 25 high and 18 moderate, no critical. Nearly all are build tools (Metro, Jest, Babel, `node-forge` used for code signing). The ones inside the shipped bundle are `decode-uri-component` and `query-string`, through expo-router (denial of service from a malformed link). Every fix npm offers is a major Expo upgrade (SDK 58), which needs a new native build: after submission, not before. |
| CODE-4 validates input | Pass | Amounts are parsed and checked before sending; the server validates everything (BACKEND_HARDENING.md). |
| RESILIENCE-1 to -4 | Out of scope | MASVS-R is for apps that must resist tampering; a prototype with simulated money is not one. |
| PRIVACY-1, -2 | Pass in config; APK Unverified | `app.json` requests no permissions and the code reads no device identifiers. Libraries can add permissions to the built manifest; that was not inspected. |
| PRIVACY-3 transparency | Pass | A privacy page is linked from More (`/privacy`). |
| PRIVACY-4 user control | Pass | The account can be deleted in the app. |

## 5. Performance and startup

### Bundle (measured)

`npx expo export --platform android`, release mode, same flags before and after
the change (P1):

| Measure | Before | After | Change |
|---------|-------:|------:|-------:|
| Hermes bytecode | 7,646,882 B | 5,752,642 B | −24.8% |
| Bytecode, gzip -9 (≈ the OTA download) | 2,636,746 B | 2,299,721 B | −12.8% |
| JavaScript before bytecode | 5,291,012 B | 3,764,137 B | −28.9% |
| JavaScript, gzip -9 | 1,059,000 B | 877,583 B | −17.1% |
| Modules in the bundle | 3,927 | 2,346 | −1,581 |
| Lucide icon modules | 1,638 | 47 | −1,591 |

Before the change, `lucide-react-native` was the largest package in the
bundle, at 28.8%, ahead of React Native itself at 15.9%. The package index
requires every icon, and Metro does not tree-shake, so `import { Home } from
"lucide-react-native"` shipped all of them. Each icon is now imported from its
own file (`components/icons.ts`), and `tests/test_icon_names.py` fails if the
backend can send an icon name the app does not ship. The test was checked by
deleting one name and watching it fail.

The source (Android, launch time) names heavy initialisation as a cause of slow
starts. Loading the icon index ran about 1,600 module factories when the first
screen imported it. Whether that is visible as startup time on a phone was
**not measured**: it needs a device (see below).

### Startup (Unverified: needs a device)

- The source says to measure time to initial display from the `Displayed` line
  in logcat, or with
  `adb shell am start -S -W app.bitback.mobile/.MainActivity`, and to compare
  cold starts before and after a change.
- Android core app quality (App_Startup_Time): the app must load quickly or
  show progress if loading takes over two seconds. Pass by design: the splash
  holds until fonts load, the start route shows a spinner, and the wake banner
  explains the up-to-60-second cold start of the free server.

### React Native guidance

| The source says | BitBack | Result |
|-----------------|---------|--------|
| Test performance in release builds, not dev mode | Measurements above are release exports | Pass |
| Remove `console.*` from release bundles | None in app code; 205 in libraries (133 warn, 64 error, 8 log), on warning and error paths | Not changed. Recommendation: stripping them would also strip crash diagnostics from logcat, for little gain |
| `FlatList`: use `getItemLayout` when rows are a fixed height | History uses a `SectionList`, which has section headers between rows | Not checked in detail; scroll smoothness Unverified without a device |
| Animate on the UI thread | Odometer and skeleton use Reanimated worklets | Pass |

Known and not changed: the home screen makes six requests each time it regains
focus (`lib/useApi.ts` explains why). A caching layer such as TanStack Query is
the fix; it is a larger change than this audit.

## 6. Release readiness: EAS Update

| The source says | BitBack | Result |
|-----------------|---------|--------|
| A build needs a channel in its `eas.json` profile | `preview` and `production` | Pass |
| `runtimeVersion` must be set | `{ "policy": "appVersion" }` → 1.0.0 | Pass |
| Print the `expo-updates` constants to see what a build is running | Not possible before | **Fixed (R1)**: the foot of More shows version, runtime, channel and update ID with date, or says the build is running its built-in code, or that an update failed and was rolled back (`components/BuildInfo.tsx`, `lib/build.ts`, 4 tests) |
| Updates that crash before the first screen renders are rolled back automatically | A crash inside one screen is not rolled back | The route error boundary (`components/ErrorBoundary.tsx`) catches those instead |

Every change in this audit is JavaScript and assets only. The app version, and
with it the runtime version, is unchanged, so `eas update --channel preview`
delivers it to the existing APK without a new build.

## 7. Android core app quality (items that apply)

| Item | Result | Evidence |
|------|--------|----------|
| Touch_Target_Size (48 dp) | Fixed | A9 |
| Visual_Contrast | Fixed | A1, A2 |
| Content_Description | Pass | 1.1.1 above |
| Back_Button_Nav | Pass by code | Stack navigation handles system back; every modal sets `onRequestClose` |
| State_Preservation | Unverified | Needs a process-death test on a phone |
| Theme_Support (light and dark) | **Fail, not fixed (D1)** | Dark only (`app.json` `userInterfaceStyle: "dark"`): a design decision, recorded as a limitation |
| App_Startup_Time | Pass by design; time Unverified | Section 5 |
| Sensitive_Data_Logging | Pass | No logging in app code |
| Autofill_Hints | Fixed | A6 |
| Network_Security_Configuration | Not declared | Needs a config plugin and a new build |
| Biometric_Authentication | Not implemented | MASVS-AUTH-2 above |
| Minimize_Permissions | Pass in config; APK Unverified | None requested in `app.json`; the merged manifest of the APK was not inspected |

## 8. What needs real users

A code audit cannot say whether people understand the app. The source
(GOV.UK, moderated usability testing; seen via search summary) describes
sessions of 30 to 60 minutes, no more than six one-hour sessions a day, and
participants who are actual or likely users. A plan that fits the time left:

1. Five participants who are curious about bitcoin but do not hold it.
2. Six tasks, read aloud as scenarios, not instructions: sign up; make a
   purchase and explain the reward; pick a boost; create a goal and move sats
   into it; find out why a transaction was flagged; delete the account.
3. Think-aloud; note task success, time and every hesitation; do not help.
4. The System Usability Scale after the session; report mean and spread
   alongside the survey.
5. Re-run the heuristic pass with one or two classmates working independently,
   then merge the lists. This addresses the single-evaluator limit above.

## 9. Not fixed, and why

| Item | Why not now | What it needs |
|------|-------------|---------------|
| C3: 43 npm advisories | Every fix is an Expo SDK major upgrade | A new native build and retesting, after submission |
| S1, server side: protect the demo account | Backend change; deploys to the live server | Approval to deploy; a guard on 2FA, password change and deletion for that one email |
| D1: no light theme | Design scope | A second palette, and every screen checked in both |
| NETWORK-2, PLATFORM-3, biometrics, network security config | Native modules or config plugins | A new APK |
| Home screen requests | Larger refactor | A query cache |
| Startup, scroll and screen-reader behaviour | No device here | The `adb` command above, TalkBack on a phone, a 200% text-size pass |

## Tests added

- `mobile/lib/format.test.ts`: plain-language fraud features, scorer names,
  durations, scaled odometer height, and WCAG contrast of the text and field
  tokens (the placeholder and edge tests fail on the old tokens).
- `mobile/lib/build.test.ts`: the four states the build line reports.
- `tests/test_icon_names.py`: every icon name the backend can send is shipped.

Front-end tests 39 → 54; backend 236 → 239 (plus 2 that run only on Postgres).

## Sources

Primary sources, as recommended for citation:

- W3C, *Web Content Accessibility Guidelines (WCAG) 2.2*:
  <https://www.w3.org/TR/WCAG22/>; *Understanding SC 2.5.8 Target Size
  (Minimum)*, read from <https://github.com/w3c/wcag>.
- Android Developers, *Make apps more accessible*:
  <https://developer.android.com/guide/topics/ui/accessibility/apps>.
- Android Developers, *Core app quality guidelines*:
  <https://developer.android.com/docs/quality-guidelines/core-app-quality>.
- Android Developers, *App startup time*:
  <https://developer.android.com/topic/performance/issues/launch-time>.
- J. Nielsen, *10 Usability Heuristics for User Interface Design*, NN/g:
  <https://www.nngroup.com/articles/ten-usability-heuristics/>.
- NN/g, *How to Conduct a Heuristic Evaluation*:
  <https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/>
  (search summary only).
- GOV.UK Service Manual, *Using moderated usability testing*:
  <https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing>
  (search summary only).
- OWASP, *Mobile Application Security Verification Standard*:
  <https://mas.owasp.org/MASVS/>; control texts read from
  <https://github.com/OWASP/owasp-masvs>.
- OWASP, *Mobile Application Security Testing Guide, Overview*:
  <https://mas.owasp.org/MASTG/0x03-Overview/>; read from
  <https://github.com/OWASP/owasp-mastg>.
- React Native, *Performance Overview*: <https://reactnative.dev/docs/performance>;
  read from <https://github.com/facebook/react-native-website>.
- Expo, *Debug EAS Update*: <https://docs.expo.dev/eas-update/debug/>; read
  from <https://github.com/expo/expo>.
