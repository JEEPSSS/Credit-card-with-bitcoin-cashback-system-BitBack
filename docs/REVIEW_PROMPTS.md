# Review prompts

Prompts for auditing BitBack against published standards. A reviewing AI is
only as good as the yardstick it is given: "is my app good?" produces opinions,
while "check it against WCAG 2.2 criterion 2.5.8, with file and line evidence"
produces findings that can be verified, fixed and cited in the report.

Every prompt below starts with the same preamble. Run one area at a time, in a
session with the repository checked out.

## Shared preamble (paste before every prompt)

```text
You are auditing BitBack, a final-year project: a simulated credit card that pays
cashback in bitcoin. Backend: FastAPI + SQLAlchemy + Postgres (app/, main.py).
Mobile: Expo SDK 54 / React Native (mobile/). Live API: https://bitcoin-survey.onrender.com.
Design tokens: mobile/lib/theme.ts. Existing evidence: docs/EVALUATION.md and
docs/BACKEND_HARDENING.md - read both first and do not re-report what they cover.

Rules:
- Audit against the named standard item by item. For each item: Pass / Fail /
  Not applicable, with evidence (file:line, a command and its output, or a
  measurement). No evidence means "Unverified", never "Pass".
- Separate what you verified from what you suspect. Never invent numbers.
- Rate each failure by severity (0 cosmetic - 4 blocks users or loses data/money).
- For each failure, propose the smallest fix, then implement it only if I say so.
  Every fix gets a test that fails before it and passes after, where testable.
- Finish with a table: item, result, severity, evidence, proposed fix.
```

## 1. Security: OWASP API Security Top 10 (2023) and MASVS v2.1

```text
Audit the backend against the OWASP API Security Top 10 2023 (API1-API10) and the
mobile app against OWASP MASVS v2.1 (STORAGE, CRYPTO, AUTH, NETWORK, PLATFORM,
CODE, RESILIENCE, PRIVACY).

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

Mobile side: where is the token stored (must be SecureStore/Keychain, not
AsyncStorage)? Is anything sensitive logged? Is HTTPS enforced? What data leaves
the device (MASVS-PRIVACY) - does it match the /privacy page?
```

## 2. Usability: Nielsen's 10 heuristics

```text
Perform a heuristic evaluation of every screen in mobile/app/ against Nielsen's 10
usability heuristics: visibility of system status; match with the real world; user
control and freedom; consistency and standards; error prevention; recognition rather
than recall; flexibility and efficiency; aesthetic and minimalist design; help users
recognise, diagnose and recover from errors; help and documentation.

For each screen list: what the user is trying to do, every violation (heuristic,
severity 0-4, file:line, what the user sees), and the fix. Pay particular attention to:
- loading, empty and error states on every data screen (system status, error recovery)
- jargon a crypto-curious non-expert would not know: sats, BTC price, boost, level
  multiplier, risk score, persona (real-world match)
- irreversible actions (delete account, delete goal, activate boost over an existing
  one): confirmation and undo (user control, error prevention)
Then list the five highest-severity problems across the whole app.
```

## 3. Accessibility: WCAG 2.2 Level AA (applied to native mobile)

```text
Audit mobile/ against WCAG 2.2 Level AA as applied to native apps:
- 1.4.3 contrast: compute the contrast ratio of every text/background token pair in
  mobile/lib/theme.ts (4.5:1 for body text, 3:1 for large text and UI components).
  Show the computed ratios.
- 2.5.8 target size (minimum): every pressable must be at least 24x24 pt, or spaced
  so a 24 pt circle does not overlap a neighbour; also note anything below Apple's
  44x44 pt guideline. List every Pressable/Button with its size.
- 1.4.4 resize text / Dynamic Type: does text scale with the OS font size without
  clipping (allowFontScaling, fixed heights)?
- 4.1.2 name, role, value: every interactive element has accessibilityRole and an
  accessible name; icons-only buttons have accessibilityLabel.
- 2.3.3 / reduced motion: animations respect the OS reduce-motion setting
  (lib/useReducedMotion.ts) - check every Reanimated use.
- 1.4.1 use of colour: is meaning (risk level, gains/losses) ever conveyed by colour alone?
- 3.3.1 / 3.3.3 errors: form errors identified in text with a suggestion.
Report a table of criterion, result, evidence, fix.
```

## 4. Visual design and consistency

```text
Review visual design against Apple's Human Interface Guidelines and Material Design 3,
using mobile/lib/theme.ts as the source of truth:
- Find every hard-coded colour, font size, spacing or radius in mobile/app and
  mobile/components that bypasses the theme tokens (grep for '#', 'fontSize:',
  numeric padding/margin). Each is a consistency defect.
- Check typographic hierarchy: does each screen have one clear primary number/action?
- Check spacing rhythm: are paddings and gaps drawn from the spacing scale?
- Check the dark theme for pure black/white extremes and for elevation being shown
  by surface colour rather than shadows.
- Compare similar components across screens (cards, list rows, headers, empty
  states) and list every inconsistency.
Output: a list of defects with file:line and the token that should be used.
```

## 5. Performance (React Native / Expo)

```text
Measure, then improve, app performance. Do not report a change as an improvement
without a before/after number.
- Bundle: run `npx expo export --platform android --dump-sourcemap`, report bundle
  size and the 10 largest modules; flag anything that could be lazy-loaded.
- Lists: every FlatList/SectionList - stable keyExtractor, memoised renderItem,
  getItemLayout where rows are fixed height, no inline functions recreated per render.
- Re-renders: find components that re-render on every parent render (inline objects
  and callbacks as props, context values recreated each render). Use React DevTools
  Profiler counts where possible.
- Network: how many requests does each screen make on open (home screen makes six)?
  Are any duplicated across screens without caching?
- Backend: re-run tests/test_query_budget.py and evaluation latency; flag any endpoint
  over 300 ms p95 on the live server (time 20 requests with curl).
Report: metric, before, after, change.
```

## 6. User experience and workflow

```text
Evaluate the main user journeys with a cognitive walkthrough, then plan how to measure
them with real users.

Walkthrough - for each task, at every step ask: will the user know what to do, will
they see how to do it, will they understand the feedback? Tasks:
1. Install, sign up, and understand what the app does (first-run).
2. Make a first simulated purchase and understand the reward breakdown.
3. Activate the recommended boost.
4. Create a savings goal and move sats into it.
5. Understand a fraud alert and what to do about it.
6. Delete the account.
Record each step where the answer is "no", with the screen and a fix.

Measurement plan (for the report):
- System Usability Scale (Brooke, 1996): the 10 standard items, 5-point scale, scored
  0-100; report mean and 95% CI; 68 is the commonly cited average.
- Task success and time-on-task for the six tasks above, observed in a session.
- Google's HEART framework (Rodden et al., 2010): pick the 2-3 categories that fit a
  prototype (Task success, Happiness, Adoption), and define goal -> signal -> metric.
```

## 7. Synthesis

```text
Combine the findings from the audits above into one prioritised list:
- Rank by severity x number of users affected x effort (S/M/L).
- Group into: fix before the demo, fix before submission, document as limitation.
- For each "fix before demo" item, give the exact change and the test that proves it.
- Draft the "Evaluation of usability, accessibility and security" section for the
  report: method (the standards used), results tables, what was fixed, what remains.
```

## Sources

- OWASP MASVS v2.1 release (privacy category added):
  [mas.owasp.org](https://mas.owasp.org/news/2024/01/18/masvs-v210-release--masvs-privacy/),
  [release notes](https://github.com/OWASP/owasp-masvs/releases),
  [category overview](https://www.appknox.com/cyber-security-jargons/masvs)
- OWASP API Security Top 10 2023:
  [apisecurity.io](https://apisecurity.io/owasp-api-security-top-10/),
  [StackHawk](https://stackhawk.com/blog/understanding-the-2023-owasp-top-10-api-security-risks)
- Nielsen's 10 usability heuristics:
  [The Decision Lab](https://thedecisionlab.com/reference-guide/design/nielsens-heuristics),
  [Gerry Stahl summary](https://www.gerrystahl.net/hci/he1.htm)
- WCAG 2.2 on native mobile, including 2.5.8 target size:
  [Deque](https://www.deque.com/blog/what-wcag-2-2-means-for-native-mobile-accessibility/),
  [Somerset playbook](https://playbook.somerset.gov.uk/digital-inclusion-and-accessibility/whats-new-in-wcag-2-2)
- Google HEART framework:
  [IxDF](https://ixdf.org/literature/article/google-s-heart-framework-for-measuring-ux),
  [Product Compass](https://www.productcompass.pm/p/the-google-heart-framework)
- React Native performance (secondary; confirm against reactnative.dev and docs.expo.dev):
  [Callstack-based best practices](https://kortix.com/marketplace/callstackincubator--agent-skills/react-native-best-practices)

For the report, cite the primary documents (W3C WCAG 2.2 Recommendation, OWASP
project pages, Nielsen 1994, Brooke 1996, Rodden et al. 2010) rather than these
summaries, and check each one.
