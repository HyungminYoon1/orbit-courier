# ORBIT COURIER architecture

Browser-only static GitHub Pages application. Public output is dist/ only.

- dist/src/model.js (or questions.js): pure deterministic generation, validation, rules and scoring. No DOM/storage/network.
- dist/src/app.js: DOM rendering, inputs and session lifecycle. Uses model functions; no DB or remote calls.
- dist/src/core.js: seeded RNG, bounded input validation, feature-detected WebMCP, device-local storage helpers.
- dist/src/records.js: pure validation/projection and transitions for bounded checkpoints, best scores, unlocks and independent achievements. No DOM/storage/network.
- dist/src/feedback.js: pure projection of actual simulation samples into target-distance/error series and failure diagnosis. Does not judge missions or modify integration.
- dist/src/progress.js: device-local aggregate storage boundary for the gallery contract; fixed 15-app whitelist, integer counts, ISO update time, no private run payload.
- test/: deterministic Node model tests; not a replacement for browser gameplay QA.
- tools/: loopback preview and static checks; .github/: pinned Pages deployment.

Device-local learning/game progress is explicitly labeled and removable; no cloud persistence, identities or global leaderboard are implemented. No analytics, external AI APIs, accounts, audio or secrets. Runtime network blocked by CSP connect-src none. The global-ranking proposal is documentation only, not an implemented service. Do not add one without a separate API/data-retention/cost decision.

## Bounded device-local records (2026-10-09)

`orbit-courier-v2` retains global unlock (1–6), up to 100 seed/stage-specific best scores (50–1500), up to 8 unique recent codes in most-recent-use order, and up to 6 unique independently completed mission IDs. Each recent checkpoint contains only code (ASCII letters/digits/hyphen, 1–40), last unlocked stage, the four bounded launch inputs, attempts (0–1,000,000), and hint-used boolean. Reload restores the latest checkpoint at the aiming phase; it does not resume elapsed flight or invent a new seed. Explicit continue/recent selection uses the same checkpoint. New randomness is generated only on first use with no valid checkpoint or explicit New code. Reset intentionally resets the current planning session and restores authored defaults. No timestamp or flight path is retained in private history; recent order is updated by actual selection/input/run, with no time expiry. Maximum raw private JSON read is 65,536 characters. Invalid fields are discarded; unavailable/corrupt/oversize storage falls back to the in-memory session with write failures shown in UI.

Existing v2 unlock/best values are retained; older best/unlock records do not imply independent completion. v1 remains untouched until explicit clear. Checkpoints persist attempts/hint use so reload alone cannot erase their score/provenance effect. Actual successful execution may unlock and set best even when assisted. Only actual success without hint/reference use in the current planning session adds an independent mission ID; repeat codes do not inflate the count. These are client-local learning records, not competitive verification.

`web-lab-progress-v1` is a same-origin, device-local shared summary: `{version:1,apps:{[repoId]:{completed,total,updatedAt}}}`. The whitelist is the 15 service IDs listed in progress.js. The helper reads at most 8,192 characters, projects only valid allowlisted aggregates (integer 0 ≤ completed ≤ total ≤ 1000, canonical ISO timestamp), preserves other valid app aggregates, and writes only this app's aggregate. A successful unassisted flight first saves the private record; only a successful private save publishes `completed = record.completed.length`, `total = 6` with the real current update time. Initial view, forecast, hint/reference selection, assisted success and failed flight do not publish. It contains no code, input, path, identity or file data. Explicit record clear removes v1/v2 and only the orbit-courier summary entry; malformed/oversize/blocked shared storage fails without overwriting it. No DB, backend or ranking is introduced. Across different origins no summary sharing is implied.

The result graph is generated only after actual playback finishes and stays in session memory. Orbit/escape measure primary-centre radius; delivery/flyby measure station-centre distance. Error is signed observed distance minus target radius, with orbit tolerance shaded. Escape and delivery graph crossings alone never establish success: energy/direction or speed/flyby rules remain authoritative. Arrival events retain contact time and the same conservative step-endpoint speed used by delivery judgment; they add telemetry without changing fixed-step integration or successful-flight criteria.
