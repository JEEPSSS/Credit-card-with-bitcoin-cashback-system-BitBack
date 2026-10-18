# Review prompts

Prompts for auditing BitBack against published standards. A reviewing AI is
only as good as the yardstick it is given: "is my app good?" produces opinions,
while "check it against WCAG 2.2 criterion 2.5.8, with file and line evidence"
produces findings that can be verified, fixed and cited in the report.

Every prompt below starts with the same preamble. Run one area at a time, in a
session with the repository checked out. The audit these prompts produced, and
what it fixed, is [APP_AUDIT.md](APP_AUDIT.md).

This second version merges in a reference list from a second reviewer. That
list contributed the primary sources (W3C, NN/g, GOV.UK, OWASP MASTG, Android,
React Native, Expo) and two areas this pack lacked, model explanations and
release readiness. This pack contributed the item-by-item procedure, the
backend's API checks, visual consistency, the cognitive walkthrough, measurement
with SUS and HEART, and the synthesis step.

## Shared preamble (paste before every prompt)

```text
You are auditing BitBack, a final-year project: a simulated credit card that pays
cashback in bitcoin. Backend: FastAPI + SQLAlchemy + Postgres (app/, main.py).
Mobile: Expo SDK 54 / React Native (mobile/). Live API: https://bitcoin-survey.onrender.com.
Design tokens: mobile/lib/theme.ts. Existing evidence: docs/EVALUATION.md,
docs/BACKEND_HARDENING.md and docs/APP_AUDIT.md - read them first and do not
re-report what they cover.

Rules:
- Open the named source and audit against it item by item. For each item: Pass /
  Fail / Not applicable, with evidence (file:line, a command and its output, or a
  measurement). No evidence means "Unverified", never "Pass".
- Cite the specific source and criterion for every recommendation, and keep the
  source's published guidance separate from your own BitBack-specific advice.
- Separate what you verified from what you suspect. Never invent numbers. Do not
  claim compliance, security or performance without evidence.
- Rate each failure by severity (0 not a problem, 1 cosmetic, 2 minor, 3 major,
  4 catastrophe).
- For each failure, propose the smallest fix, then implement it only if I say so.
  Every fix gets a test that fails before it and passes after, where testable.
- Finish with a table: item, source, result, severity, evidence, proposed fix.
```

## 1. Security: OWASP API Security Top 10 (2023), MASVS and MASTG

```text
Audit the backend against the OWASP API Security Top 10 2023 (API1-API10), and the
mobile app against OWASP MASVS v2 (STORAGE, CRYPTO, AUTH, NETWORK, PLATFORM, CODE,
RESILIENCE, PRIVACY), using the MASTG for how each control is tested.

API side - for every route in app/routers/:
- API1 BOLA: can user A read or change user B's object by changing an id? Write a
  test with two users for every route that takes an id (goals, alerts, fraud score,
  transactions).
- API2 auth: token lifetime, revocation, brute-force limits, reset flow.
- API3 property-level: does any response include fields the caller should not see
  (password hash, TOTP secret, other users' emails)? Dump every response schema.
- API4 resource consumption: unbounded lists, missing pagination caps, payload size limits.
- API5 function-level: any admin-like or internal route reachable by a normal user?
- API6 sensitive business flows: can referrals, signups, boosts or transactions be
  automated to farm sats? Check rate limits per account and per address.
- API7 SSRF: does any input reach an outbound request?
- API8 misconfiguration: CORS, debug, docs exposure, error leakage, headers.
- API9 inventory: undocumented or stale routes vs the OpenAPI spec.
- API10 unsafe consumption: CoinGecko/Coinbase responses validated before use?

Mobile side, one row per MASVS control: where is the token stored (must be
SecureStore/Keychain, not AsyncStorage)? Is anything sensitive logged or copied?
Is HTTPS enforced in release builds? Which known-vulnerable packages ship
(npm audit --omit=dev, then say which are in the runtime bundle and which are
build tools)? What data leaves the device, and does it match the /privacy page?
Are shared or default credentials reachable from the app?

MASTG distinguishes static review from dynamic testing on a device. Label every
result with which one you did, and do not report MASVS compliance from a static
review alone.
```

## 2. Usability: Nielsen's 10 heuristics

```text
Perform a heuristic evaluation of every screen in mobile/app/ against Nielsen's 10
usability heuristics (nngroup.com/articles/ten-usability-heuristics), following
NN/g's method (nngroup.com/articles/how-to-conduct-a-heuristic-evaluation): two
passes - the flow first, then each element - and severity ratings.

For each screen list: what the user is trying to do, every violation (heuristic,
severity 0-4, file:line, what the user sees), and the fix. Pay particular attention to:
- loading, empty and error states on every data screen, and any action whose
  failure is swallowed (a catch that sets nothing, an await with no catch)
- jargon a crypto-curious non-expert would not know: sats, BTC price, boost, level
  multiplier, risk score, persona (real-world match)
- irreversible actions (delete account, delete goal, delete alert, replace a boost):
  confirmation and undo (user control, error prevention)
Then list the five highest-severity problems across the whole app. State that one
evaluator finds only part of what several independent evaluators would.
```

## 3. Accessibility: WCAG 2.2 Level AA and Android accessibility

```text
Audit mobile/ against WCAG 2.2 Level AA (w3.org/TR/WCAG22) as applied to native
apps, and Android's accessibility guidance
(developer.android.com/guide/topics/ui/accessibility/apps):
- 1.4.3 / 1.4.11 contrast: compute the ratio of every text/background token pair in
  mobile/lib/theme.ts (4.5:1 body text, 3:1 large text and UI components such as
  text field edges), including placeholder colour. Show the computed ratios.
- 2.5.8 target size (minimum): every pressable at least 24x24, or spaced so a 24
  circle does not overlap a neighbour. Separately, Android asks for 48x48 dp and
  Apple 44x44 pt; list every Pressable/Button with its size and hitSlop.
- 1.4.4 resize text: does text scale with the OS font size without clipping? Look
  for heights computed from an unscaled font size.
- 4.1.2 name, role, value: every interactive element has a role and a name; icon-only
  buttons have accessibilityLabel; radios use `checked`, not `selected`; groups have
  radiogroup; toggles expose their state.
- 1.3.1 headings: are screen and section titles exposed as headers?
- 1.3.5 input purpose: autoComplete / textContentType on account fields.
- 1.4.1 use of colour: is meaning (risk level, gains/losses, before/after rates)
  ever conveyed by colour alone?
- 3.3.1 / 3.3.3 / 3.3.4 errors: identified in text, with a suggestion; destructive
  actions on user data confirmed or reversible.
- 4.1.3 status messages: are errors and confirmations announced when they appear?
- 2.3.3 animation from interactions is AAA, beyond the AA target: report it, but as
  best practice (lib/useReducedMotion.ts, every Reanimated use).
Report a table of criterion, result, evidence, fix. Mark anything that needs
TalkBack, VoiceOver or a 200% text size on a phone as Unverified.
```

## 4. Visual design and consistency

```text
Review visual design against Apple's Human Interface Guidelines and Material Design 3,
using mobile/lib/theme.ts as the source of truth:
- Find every hard-coded colour, font size, spacing or radius in mobile/app and
  mobile/components that bypasses the theme tokens (grep for '#', 'rgba(',
  'fontSize:', numeric padding/margin/borderRadius). Each is a consistency defect.
- Check typographic hierarchy: does each screen have one clear primary number/action?
- Check spacing rhythm: are paddings and gaps drawn from the spacing scale?
- Check the dark theme for pure black/white extremes and for elevation being shown
  by surface colour rather than shadows. Android core app quality (Theme_Support)
  expects light and dark: say whether dark-only is a deliberate limitation.
- Compare similar components across screens (cards, list rows, headers, empty
  states, error messages) and list every inconsistency.
Output: a list of defects with file:line and the token that should be used.
```

## 5. Performance and startup

```text
Measure, then improve, app performance against React Native's performance guide
(reactnative.dev/docs/performance) and Android's startup guidance
(developer.android.com/topic/performance/issues/launch-time). Do not report a
change as an improvement without a before/after number.
- Bundle: run `npx expo export --platform android --no-bytecode --dump-sourcemap`,
  attribute bytes to packages from the source map, and report the bundle size, the
  10 largest packages and the module count. Re-run after any change with the same
  flags. Check for whole-library imports (icon sets, lodash, date libraries).
- console.*: count calls in app code and in the shipped bundle, by type.
- Lists: every FlatList/SectionList - stable keyExtractor, memoised renderItem,
  getItemLayout where rows are fixed height.
- Re-renders: inline objects and callbacks as props, context values recreated each
  render. Use React DevTools Profiler counts where possible.
- Network: how many requests does each screen make on open? Any duplicated across
  screens without caching?
- Startup (needs a device): time to initial display from logcat's "Displayed" line
  or `adb shell am start -S -W`, cold start, before and after. Android core app
  quality: show progress if loading takes over two seconds.
- Backend: re-run tests/test_query_budget.py and evaluation latency; flag any endpoint
  over 300 ms p95 on the live server (time 20 requests with curl).
Report: metric, before, after, change, and how it was measured.
```

## 6. Model explanations and user trust

```text
Apply Nielsen's heuristics on plain language, visibility of system status,
consistency and error recovery to every place the app describes a model: AI
insights, fraud protection, boosts, the forecast on Home, More. Then check each
claim against the implementation and docs/EVALUATION.md / evaluation/results.json -
usability guidance does not establish that a claim is statistically true.
For each claim give: the screen text, file:line, the constant or result that
supports or contradicts it, and a verdict (correct / overstated / wrong / missing).
Check in particular:
- the number and names of models against the code
- thresholds (risk 56, persona minimum purchases, training size) against constants,
  and whether the app reads them from one place or repeats them as literals
- probability and interval wording ("80% likely") against measured coverage
- confidence figures against calibration (ECE)
- whether raw model inputs or version strings are shown to users unexplained
- whether accuracy and false-alarm rates are stated, so trust is calibrated both ways
```

## 7. User experience and workflow

```text
Evaluate the main user journeys with a cognitive walkthrough, then plan how to test
them with real users following GOV.UK's guidance on moderated usability testing
(gov.uk/service-manual/user-research/using-moderated-usability-testing).

Walkthrough - for each task, at every step ask: will the user know what to do, will
they see how to do it, will they understand the feedback? Tasks:
1. Install, sign up, and understand what the app does (first-run).
2. Make a first simulated purchase and understand the reward breakdown.
3. Activate the recommended boost.
4. Create a savings goal and move sats into it.
5. Understand a fraud alert and what to do about it.
6. Delete the account.
Record each step where the answer is "no", with the screen and a fix.

Real-user plan (for the report):
- Moderated sessions with actual or likely users, tasks given as scenarios,
  think-aloud, no help from the moderator; session length and daily load per GOV.UK.
- Task success and time-on-task for the six tasks above.
- System Usability Scale (Brooke, 1996): the 10 standard items, 5-point scale, scored
  0-100; report mean and 95% CI; 68 is the commonly cited average.
- Google's HEART framework (Rodden et al., 2010): pick the 2-3 categories that fit a
  prototype (Task success, Happiness, Adoption), and define goal -> signal -> metric.
```

## 8. Release readiness

```text
Check that what testers run is what was built, using Expo's EAS Update debugging
guide (docs.expo.dev/eas-update/debug) and Android core app quality
(developer.android.com/docs/quality-guidelines/core-app-quality) for device checks.
- eas.json: every build profile has a channel; app.json sets runtimeVersion and
  updates.url; the channel maps to the branch updates are published to.
- Can a tester see, on the phone, which update it is running (Updates.updateId,
  channel, runtimeVersion, createdAt, isEmbeddedLaunch, isEmergencyLaunch)?
- Which crashes does EAS roll back automatically (before the first render) and which
  must the app's error boundary handle?
- Does the change need a new binary (native module, config plugin, app version) or
  can it ship as an update?
- Device checks to run before a demo: back button and gesture navigation, rotation
  and return from background without losing state, TalkBack pass, 200% text size,
  airplane mode on each data screen.
```

## 9. Synthesis

```text
Combine the findings from the audits above into one prioritised list:
- Rank by severity x number of users affected x effort (S/M/L).
- Group into: fix before the demo, fix before submission, document as limitation.
- For each "fix before demo" item, give the exact change and the test that proves it.
- Draft the "Evaluation of usability, accessibility and security" section for the
  report: method (the standards used, how each was accessed, one evaluator, static
  review), results tables, what was fixed, what remains.
```

## Sources

Primary sources, to cite in the report:

- W3C, Web Content Accessibility Guidelines (WCAG) 2.2: <https://www.w3.org/TR/WCAG22/>
- Android Developers, Make apps more accessible:
  <https://developer.android.com/guide/topics/ui/accessibility/apps>
- Android Developers, Core app quality guidelines:
  <https://developer.android.com/docs/quality-guidelines/core-app-quality>
- Android Developers, App startup time:
  <https://developer.android.com/topic/performance/issues/launch-time>
- J. Nielsen, 10 Usability Heuristics for User Interface Design:
  <https://www.nngroup.com/articles/ten-usability-heuristics/>
- NN/g, How to Conduct a Heuristic Evaluation:
  <https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/>
- GOV.UK Service Manual, Using moderated usability testing:
  <https://www.gov.uk/service-manual/user-research/using-moderated-usability-testing>
- OWASP, Mobile Application Security Verification Standard: <https://mas.owasp.org/MASVS/>
- OWASP, Mobile Application Security Testing Guide: <https://mas.owasp.org/MASTG/0x03-Overview/>
- OWASP, API Security Top 10 2023: <https://owasp.org/API-Security/editions/2023/en/0x11-t10/>
- React Native, Performance Overview: <https://reactnative.dev/docs/performance>
- Expo, Debug EAS Update: <https://docs.expo.dev/eas-update/debug/>
- Brooke (1996), SUS: a "quick and dirty" usability scale; Rodden, Hutchinson and Fu
  (2010), Measuring the user experience on a large scale (HEART).

Secondary summaries used while writing the first version, useful for orientation
but not for citation: [Deque on WCAG 2.2 for native mobile](https://www.deque.com/blog/what-wcag-2-2-means-for-native-mobile-accessibility/),
[apisecurity.io on the API Top 10](https://apisecurity.io/owasp-api-security-top-10/),
[IxDF on HEART](https://ixdf.org/literature/article/google-s-heart-framework-for-measuring-ux).
