# Systematic edge-case audit — 2026-10-13

LOCAL ONLY. This is a new systematic audit, separate from the earlier guide/copy maintenance on the same date. No commit, push, deployment, remote CI run, gallery/ranking-server changes or external services.

## Source inventory and authority

- Named repository `orbit-courier`: VERIFIED inventory, clean starting main worktree; baseline HEAD `b1f1bd16e4a01136a73b4cbe099cdcb3f730e74b`.
- VERIFIED full reads: architecture.md > README.md, docs/decisions.md, package.json, .github/workflows/pages.yml, .gitattributes, .gitignore; all dist/src modules (app.js, core.js, model.js, records.js, feedback.js, progress.js); all existing test files and relevant fixtures; tools/check.mjs and serve.mjs. No api-spec.md or requirements.md was present. User-supplied AGENTS instructions applied.
- VERIFIED current HTML control inventory; CSS PARTIAL (relevant responsive/focus/overflow selectors and source portions selected for browser QA, not a complete stylesheet audit). docs/verification.md PARTIAL: current/latest evidence and relevant prior coverage read, historical deployment sections not reverified. Favicon/Git internals/generated caches are inventoried, content NOT_INSPECTED.
- Existing ignored `.qa/output/playwright/qa-20261013/qa.cjs`: VERIFIED and reused as primary flow in tracked tools/edge-browser.cjs. New edge assertions extend it. Root output/playwright/implement-20261012/package.json VERIFIED exists (Playwright1.61.1); specified Chrome executable VERIFIED by actual launch. Other root QA tools only inventoried. Sibling repositories, gallery and ranking server NOT_INSPECTED/NOT_MODIFIED by this owner.
- Feature boundaries accounted for: 6 missions; fixed-step simulation, swept collision, conserved energy, scheduled burn, actual-only feedback, scoring, aiming/play/pause/retry/reset, codes/MRU/checkpoints/unlocks, independent completion and aggregate deletion.

## Executable boundary matrix

N = new pure test in test/edge.test.js; U = actual app callbacks in test/ui.test.js with DOM/storage doubles; E = existing named tests retained; B = tools/edge-browser.cjs actual Chrome. All executed entries below VERIFIED/PASS; doubles/injection are labeled and do not establish physical-device or production evidence. `npm test` runs N/U/E; B is separate and NOT executed by the current CI workflow.

| Feature/boundary | Cases mapped to actual tests / observations | Evidence |
| --- | --- | --- |
| Launch/code input | NEW baseline PASS: `edge: every launch field accepts exact endpoints and rejects just-outside, type and nonfinite values` (angle -180/180, speed 20/320, burn -80/80, time 0/20; +/-0.001 outside, empty/string/bool/NaN/+Inf/-Inf). Code 1/40 accepted, 41/empty/Korean/type rejected. | N |
| Numerics and contact | NEW baseline PASS: `edge: swept contact distinguishes stationary outside and exact endpoint contact`. Existing `inverse-square gravity and vector superposition have analytic values`, `circular speed, energy and eccentricity match two-body analytic equations`, delivery/flyby tests. | N + E |
| Burn/terminal/fuel | NEW baseline PASS: `edge: burn quantization, zero burn and post-terminal burn preserve fuel provenance` (DT*0.49/0.51, burn zero, burn after successful termination); existing retrograde stop, flyby passage and transfer rules. | N + E |
| Score | NEW baseline PASS: `edge: scoring has exact independent rounding and floor at maximum attempts`: hand-calculated 1287, 1122, floor 50, failure 0. Existing attempt/hint/fuel scoring. | N + E |
| Restore/reset/repeat | NEW baseline PASS UI: `edge: restore caps attempts and preserves assistance until explicit reset` (1,000,000 attempts, play/pause/resume one pending frame, reset cancels frame, retains best/completed). `edge: invalid code during playback leaves the current flight and checkpoint untouched`. Browser checkpoint reload, assistance, retry and six successful flights. | U + B |
| Records/import bounds | NEW baseline PASS: `edge: MRU snapshots detach input aliases and keep score boundaries and completion uniqueness`; `edge: bounded JSON accepts the exact read limit and denies the next character` (65536/65537). Existing malformed JSON fallback and MRU 8/best 100. File import/export and undo N/A: absent features. | N + E |
| Storage/peer isolation | Existing `summary read-modify-write and own clear preserve other app aggregates, omit run data`, `summary validates integer counts, ISO times, whitelist and payload size; corrupt/blocked writes fail safely`. Browser setItem quota fixture -> same raw private/summary readback; real own erase preserves echo-vault aggregate and peer private key. | E + B |
| Keyboard/IME/rapid keys | RED->GREEN `edge: IME composition and held Space must not launch or pause a flight`. Browser synthetic isComposing fixture, real keyboard down/down/up Space, real Home/End/outside range clamp; subsequent normal flight works. | U + B |
| Success vs hints/forecast | Existing `hint/example success unlocks normally but fails the independent gate; failed flights never record success`; browser ellipse failure -> independent orbit -> assisted 2..6; completed remains 1. Graph is not a success judge. | E + B |
| Async/UI/mobile | No remote async API N/A; animation lifecycle tested above. Startup/final/result screenshots 1440/390/320, numeric horizontal fit. Physical IME/touch, all rendering devices, pointer-drag exhaustiveness and pagehide/BFCache race NOT_RUN. | B / NOT_RUN |

## Failures before / fixes after

Unchanged app + `node --test --test-name-pattern='edge:' test/ui.test.js`: expected `발사 준비`, actual `비행 중` at composing Space. Added restore and invalid-code tests already passed. Same command after fix: 3/3 PASS. Minimal guard ignores composing keys and repeated Space; deliberate Space and repeated direction keys keep their behavior.

Minimal fix: Ignore composing canvas key events and held-Space repeats before invoking launch/pause. No legitimate assertion was relaxed. 6 new pure tests passed on unchanged production code; these are coverage additions, **not RED_GREEN**. Total 9 new executable Node tests: 1 genuine failing regressions, 8 baseline-passing additions (including UI sequence checks). Existing 36 tests retained.

The browser harness had trial issues with async-status readiness and a collapsed erase control; corrected waits/visible-control navigation without changing product expectations. Those are harness issues, not product bugs or additional RED_GREEN claims.

## Commands and local results

- `node --test test/edge.test.js`: baseline 6/6 PASS before app edits.
- `node --test --test-name-pattern='edge:' test/ui.test.js`: original failures described above; same regression test executable after fix PASS.
- `npm test`: 45/45 PASS, fail0. `npm run check`: PASS. No test/workflow/dependency command changed.
- `git diff --check`: PASS at final handoff. Only edited text normalized UTF-8 without BOM / CRLF.
- Browser: start own persistent loopback server using `node tools/serve.mjs 0`; use emitted URL, then `node tools/edge-browser.cjs http://127.0.0.1:<port>/`. It resolves the already-installed root Playwright package (optional PLAYWRIGHT_MODULE_PATH path override), launches isolated headless Chrome at the requested executable with --mute-audio, and closes its owned context/browser in finally. Stop the owned preview session after completion. It never uses the personal Chrome profile.
- Existing workflow runs npm test/check on Node22 and includes all new Node tests. Browser harness retained in tools/ and runnable locally; CI browser execution NOT_RUN/not configured. Remote CI/live deployment NOT_RUN.

## Browser and visual evidence

Six UI success scores 1210/1029/1142/1136/1144/1000 (actual attempt/hint penalties). First success independent, later flights assisted. Primary flow 26 named checks plus additional edge assertions.

Additional flows include the new input/lifecycle regression, malformed or oversized imports where available, cancellation where available, explicit Storage.setItem quota failure injection with unchanged raw-record readback, and actual own-record erase preserving synthetic echo-vault/peer-private fixtures. Storage denial/quota in Node are test doubles; browser quota is deliberately injected, not a claim that physical disk quota was exhausted.

Evidence folder (already ignored): `.qa/output/playwright/edge-20261013/`. Artifacts: startup-1440/390/320.png; final-viewport-1440/390/320.png; ellipse-failure-1440.png; mission-1-1440.png through mission-6-1440.png; transfer-result-390.png / transfer-result-320.png. browser-report.json contains local outcomes/page errors/console logs. Node evidence baseline-tests.txt, regression-before.txt, regression-after.txt, final-tests-check.txt is local only. Actual 1440x1000 / 390x844 / 320x844 views and relevant full result states captured; screenshots reviewed separately from numeric horizontal-fit checks. Pages intentionally scroll; no fixed-shell fit guarantee is claimed. Observed tested page errors/console errors/warnings0.

UI **behavior** changed; HTML/CSS/layout did not. Parent screenshot refresh review recommended at the primary/result capture states above; no gallery screenshot changed here.

Exploratory mobile emulation also exercised touch/tap and mixed controls in two short interaction bursts: forecast toggle, touch aiming, reset and an actual assisted reference flight; focused chart-detail-1440/390/320.png. Observed exploratory page errors0; emulation is not physical mobile proof. Detailed chart/cost/terminal screenshots were separately reviewed at readable scale.

Runtime cleanup: final standalone harnesses closed their own Chrome/context in finally; exploratory contexts/browser explicitly closed. Four owned loopback listeners stopped after verification. An earlier interactive REPL timed out while a hidden erase control was being waited for; its initial handle was lost. Its process termination could not be independently confirmed from the reset REPL, so no ambiguous shared Chrome process was killed. Final self-closing CLI evidence supersedes that interrupted harness run.


## Decisions and integration limits

See D13 in decisions.md. Rules/versions, physics, mission predicates, scoring, storage keys/schemas/bounds/retention, 15-ID allowlist and separation of concerns retained. Browser fixtures use disposable contexts; no user records erased. Runtime code change is confined to dist/src/app.js.

All seeds/plans, long-term orbit stability, secondary pointer gestures, screenreader and real phone/IME are NOT_RUN. No file import, undo or cloud async calls exist. A paused flight is not resumed by persisted elapsed time.

All engines/devices/possible seeds or campaigns, measured learning efficacy, cross-origin gallery sharing and same-origin full gallery integration are NOT_RUN. Peer fixtures verify contract preservation, not sibling app UI integration. Shared storage is intentionally last-writer-wins; no atomic cross-tab or two-key transaction claim. No unsupported physics/logic/policy rule was repaired by changing its definition.

Changed files: dist/src/app.js; test/ui.test.js; new test/edge.test.js; new tools/edge-browser.cjs; docs/decisions.md; docs/verification.md; new docs/edge-cases-20261013.md. All changes uncommitted. Parent integrates/reviews/releases; this report provides no deployed/live assertion.

