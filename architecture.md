# ORBIT COURIER architecture

Browser-only static GitHub Pages application. Public output is dist/ only.

- dist/src/model.js (or questions.js): pure deterministic generation, validation, rules and scoring. No DOM/storage/network.
- dist/src/app.js: DOM rendering, inputs and session lifecycle. Uses model functions; no DB or remote calls.
- dist/src/core.js: seeded RNG, bounded input validation, feature-detected WebMCP, device-local storage helpers.
- test/: deterministic Node model tests; not a replacement for browser gameplay QA.
- tools/: loopback preview and static checks; .github/: pinned Pages deployment.

Device-local learning/game progress is explicitly labeled and removable; no cloud persistence, identities or global leaderboard are implemented. No analytics, external AI APIs, accounts, audio or secrets. Runtime network blocked by CSP connect-src none. The global-ranking proposal is documentation only, not an implemented service. Do not add one without a separate API/data-retention/cost decision.
