# Review prompts

Prompts for auditing BitBack against published standards. A reviewing AI is
only as good as the yardstick it is given: "is my app good?" produces opinions,
while "check it against WCAG 2.2 criterion 2.5.8, with file and line evidence"
produces findings that can be verified, fixed and cited in the report.

Every prompt below starts with the same preamble. Run one area at a time, in a
session with the repository checked out. The audit these prompts produced, and
what it fixed, is [APP_AUDIT.md](APP_AUDIT.md). If the reviewing tool cannot
open a source page, paste the matching summary from the
[appendix](#appendix-source-summaries) after the prompt.

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
- Open the named source and audit against it item by item. If a page cannot be
  fetched, use the summary supplied with this prompt and say which sources you
  could not open yourself.
- For each item: Pass / Fail / Not applicable, with evidence (file:line, a command
  and its output, or a measurement). No evidence means "Unverified", never "Pass".
- Keep four things apart: requirements the sources support, confirmed findings in
  BitBack, your own recommendations, and checks that need a device or real users.
- Cite the specific source and criterion for every recommendation. Never invent
  numbers. Do not claim compliance, certification, security or performance without
  evidence.
- Rate each failure by severity (0 not a problem, 1 cosmetic, 2 minor, 3 major,
  4 catastrophe) and by your confidence in it.
- Use only disposable test accounts and simulated data. Never retrieve real
  credentials, use other people's accounts, or run anything destructive against
  the live server.
- Present the audit before changing anything. For each failure propose the
  smallest fix and implement it only if I say so; every fix gets a test that fails
  before it and passes after, where testable.
- Finish with a table: item, source, file:line, user impact, severity, confidence,
  smallest fix, how to verify it.
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
SecureStore/Keychain, not AsyncStorage), and is it excluded from caches and
backups? Is anything sensitive logged or copied? Does the app tell an expired
session apart from a network failure? Is HTTPS enforced in release builds? What
can a link to the app's URL scheme open, and which components are exposed? Which
known-vulnerable packages ship (npm audit --omit=dev, then say which are in the
runtime bundle and which are build tools)? What data leaves the device, and does
it match the /privacy page? Are shared or default credentials reachable from the
app? Keep RESILIENCE proportionate to a simulated student project.

Follow MASTG's approach: define the scope, sensitive data and trust boundaries;
map each MASVS requirement to a concrete test; inspect source and configuration
first; then list the questions that need the installed app, each with its
precondition, steps and expected result. Label every result static or dynamic,
and do not report MASVS compliance from a static review alone.
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
  circle does not overlap a neighbour. WCAG states this in CSS pixels, which are
  not Android dp; say that reading it as dp is an assumption. Separately, Android
  asks for 48x48 dp and Apple 44x44 pt; list every Pressable/Button with its size
  and hitSlop.
- 1.4.4 resize text: does text scale with the OS font size without clipping? Look
  for heights computed from an unscaled font size.
- 4.1.2 name, role, value: every interactive element has a role and a name; icon-only
  buttons have accessibilityLabel; radios use `checked`, not `selected`; groups have
  radiogroup; toggles expose their state.
- 1.3.1 headings: are screen and section titles exposed as headers?
- 1.3.2 / 2.4.3 order: does the reading and focus order follow the visual order?
  Look for absolutely positioned views and anything rendered outside the screen.
- 2.4.11 focus not obscured: can a banner, toast, sheet or the keyboard cover the
  control that has focus? Does an overlay also swallow touches (no pointerEvents)?
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
Inspect only: do not change configuration, remap channels, publish updates or
create builds during the review.
- Trace the chain: installed build -> channel -> linked branch -> latest compatible
  update (same runtime version and platform). The newest update overall may not be
  the one delivered.
- eas.json: every build profile has a channel; app.json sets runtimeVersion, and
  updates.url points at the same project as extra.eas.projectId; expo-updates is
  enabled. For BitBack expect channel preview, Android, runtime 1.0.0.
- Can a tester see, on the phone, which update it is running (Updates.updateId,
  channel, runtimeVersion, createdAt, isEmbeddedLaunch, isEmergencyLaunch)?
- Which crashes does EAS roll back automatically (before the first render) and which
  must the app's error boundary handle?
- Does the change need a new binary (native module, config plugin, app version) or
  can it ship as an update?
- Tell delivery problems apart from crashes that happen after the right update
  has loaded.
- A successful publish does not prove the screens work: after delivery, record
  the update group and the update ID the phone shows, then smoke-test sign-in,
  Home, Boosts, AI insights, Fraud protection and account settings.
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

## Appendix: source summaries

For when a reviewing tool cannot open the pages. These summaries were supplied
by the project author after opening the pages themselves (October 2026). They
are summaries, not copies: quote the pages, not these, in the report. Where this
environment could read the same source (MASVS, MASTG and the EAS page from their
GitHub repositories), the summaries agree with it.

### WCAG 2.2 ([w3.org/TR/WCAG22](https://www.w3.org/TR/WCAG22/))

```text
Use these accessibility criteria when reviewing BitBack:

- Text contrast: ordinary text generally needs at least 4.5:1;
  qualifying large text needs 3:1. Exceptions include inactive
  controls, decoration and logos.
- Essential visual boundaries, states and graphics generally
  need 3:1 contrast against adjacent colours.
- Do not communicate meaning through colour alone.
- Support text enlargement without losing content or functionality.
  WCAG's web criterion specifies enlargement to 200%.
- Give meaningful icons and controls accessible names.
- Expose control roles, values and states to assistive technology.
- Make reading and focus order follow a meaningful sequence.
- Keep focused controls visible rather than obscured.
- Provide clear field labels, instructions and useful error messages.
- Make status messages available to assistive technology without
  unnecessarily moving focus.
- Support accessible authentication, including password-manager
  and paste assistance.
- WCAG 2.2 AA specifies a 24x24 CSS-pixel minimum pointer target,
  with spacing and other exceptions. CSS pixels are not Android dp.

For BitBack, use these as evaluation references alongside native
Android guidance. Test TalkBack, enlarged text, form errors,
loading states and transaction controls. Do not claim compliance
from screenshots or source inspection alone.
```

### OWASP MASVS ([mas.owasp.org/MASVS](https://mas.owasp.org/MASVS/))

```text
Organise BitBack's security review around these eight MASVS groups:

1. STORAGE    Protect sensitive information stored on the device.
              Inspect token storage, caches, logs and backups.
2. CRYPTO     Use appropriate cryptographic mechanisms and protect keys.
              Identify any custom cryptography requiring further review.
3. AUTH       Review authentication, authorisation and session handling.
              Distinguish an expired session from a network failure.
4. NETWORK    Protect communication between the app and remote services.
              Inspect HTTPS configuration and sensitive transmitted data.
5. PLATFORM   Review interactions with the operating system and other apps,
              including permissions, links and exposed components.
6. CODE       Review secure data processing, dependencies and update handling.
7. RESILIENCE Consider resistance to tampering and reverse engineering,
              proportionate to the app's risks.
8. PRIVACY    Review personal-data collection, use, disclosure and protection.

For each group, record the evidence, applicable controls,
unverified assumptions and practical improvements.

These are review categories, not proof that BitBack is secure.
Keep the assessment proportional to a simulated student project.
Never retrieve real credentials or test other users' accounts.
```

### OWASP MASTG overview ([mas.owasp.org/MASTG/0x03-Overview](https://mas.owasp.org/MASTG/0x03-Overview/))

```text
MASVS describes security requirements. MASTG provides supporting
testing methodology and technical guidance.

Its coverage includes:
- General mobile security analysis.
- Authentication and session management.
- Network communication and cryptography.
- Android-specific security testing.
- iOS-specific security testing.
- Reverse engineering and tampering techniques.

Its techniques can also inform reviews of cross-platform apps
because those apps ultimately interact with native components.

Apply that approach to BitBack as follows:

1. Define the scope and identify sensitive data and trust boundaries.
2. Map relevant MASVS requirements to concrete tests.
3. Inspect source and configuration for supporting evidence.
4. Identify which questions require runtime or device verification.
5. Record preconditions, expected behaviour, observed behaviour
   and reproducible evidence.
6. Mark untested controls as unverified, rather than passed.

For this review, inspect code first. Propose device checks using
disposable accounts and simulated data. Do not perform production
penetration testing, intercept real credentials, or exercise
destructive operations without separate authorisation.

This BitBack procedure is an application of the guidance,
not a claim that the overview prescribes these exact steps.
```

### Expo EAS Update debugging ([docs.expo.dev/eas-update/debug](https://docs.expo.dev/eas-update/debug/))

```text
Trace EAS Update delivery through this chain:

Installed build -> channel -> linked branch -> compatible update.

Check:
- The installed build's channel.
- Which update branch that channel points to.
- Whether an update exists on that branch.
- Whether the build and update have matching runtime versions
  and platforms.
- Whether the update URL points to the correct EAS project.
- Whether expo-updates is enabled and correctly configured.

The latest compatible update on the linked branch is eligible
for delivery; the newest update overall may be incompatible.

For diagnosis, Expo describes inspecting update constants,
native update logs, update-fetch errors and network responses.
Distinguish delivery/configuration problems from crashes that
happen after the expected update loads.

For BitBack, verify the expected preview channel, Android
platform and runtime 1.0.0. Record the update group and the
update actually running on the device.

A successful publish does not establish that every screen works.
After confirming delivery, smoke-test sign-in, Home, Boosts,
AI insights, Fraud protection and account settings.

Inspect first. Do not change configuration, remap channels,
publish updates or create builds during this review.
```

### Closing instruction (paste after the summaries)

```text
Use the supplied summaries if their source pages cannot be fetched.
Clearly disclose any source you could not independently open.

Separate:
- Requirements supported by the references.
- Confirmed findings in BitBack.
- Your own recommendations.
- Checks requiring device testing or real users.

For each finding, give the file and line, user impact, severity,
confidence, smallest practical improvement and verification steps.

Do not invent measurements, claim security certification, or mark
untested behaviour as passed. Present the audit before changing
anything.
```

No summaries are held yet for NN/g (heuristics, heuristic evaluation method) or
GOV.UK (moderated usability testing); those two pages were only seen through
search results.
