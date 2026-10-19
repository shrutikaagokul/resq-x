# Verification record

## Warm city redesign — 11 October 2026

The existing frontend was redesigned in place. No backend source, AI algorithms, API contracts, city graph, or building identities changed.

- `npm run lint`: passed.
- `npm run build`: passed; the existing large Three.js chunk warning remains.
- `.venv/bin/python -m pytest -q`: all 39 existing backend tests passed.
- `npm run test:e2e`: both browser scenarios passed with no console errors.
- Browser geometry assertions verified a full-width city at 78% of desktop viewport height, no permanent sidebar, and controls below the city.
- Real canvas clicks verified hospital, vehicle, road, and incident selection; panels displayed the matching live backend values. Incident escalation and road block/reopen controls were exercised.
- The guided demo, ICU change, online discovery, vehicle failure, event injection, search comparison, WHY explanations and reset were exercised against the unchanged backend.
- A targeted active-route blockage increased the plan revision and produced a different fire-truck route. The graph nodes and buildings remained identical to seed data.
- Desktop and 390px mobile screenshots were inspected. The mobile details panel uses a compact scrollable overlay to retain visibility of the city.

Browser tests now use isolated ports 18000/15173 and a test database, avoiding the normal development servers. The README screenshot reflects the redesign. Shared design tokens are in `frontend/src/styles/tokens.css`; Three.js reads the same colors via `cityTheme.js`.

## Original implementation verification

Verified locally on **5 October 2026**, macOS, Python 3.13.7 and Node.js 24.8.0.

| Check | Result |
| --- | --- |
| `.venv/bin/python -m pytest -q` | 39 tests passed |
| `npm run lint` in `frontend/` | Passed |
| `npm run build` in `frontend/` | Production bundle generated |
| `npm run test:e2e` in `frontend/` | Full Chromium browser scenario passed |
| `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` | Full installed-Chrome scenario also passed |
| `git diff --check` | No whitespace errors |

The browser test starts real Uvicorn and Vite processes and communicates over HTTP. It verifies:

- Visible WebGL city canvas and command-center UI.
- Guided factory incident and four initial assignments.
- Road blockage, plan revision/invalidation and later online road discovery.
- Hospital-capacity and second-emergency events through the timed scenario.
- WHY dialog with recorded assignment constraints.
- Search comparison from the event controls.
- Road reopening, vehicle failure and another incident through UI controls.
- Narrow-screen layout without horizontal page overflow.
- Reset returning to the seeded ready screen.
- No browser console errors or uncaught page exceptions in the final run.

Desktop, explanation and mobile screenshots were captured in `artifacts/` and inspected. A desktop screenshot is retained in `docs/command-center.png`. Browser tests use a separate temporary SQLite database and shut down their own servers after finishing.

Backend integration tests additionally execute 110 simulation seconds, checking every active plan and hospital capacity on every tick. They verify patient admission, explicit unresolved ICU scarcity, vehicle movement semantics, rerouting an onboard patient, transfer pickup after vehicle failure, and SQLite restart persistence.

## Non-blocking warnings / limits

- Vite reports a large Three.js chunk (about 1.15 MB minified, 319 KB gzip). The application loads and renders successfully; the 3D engine is the dominant bundle dependency.
- The installed Starlette version emits a deprecation warning about its current HTTPX TestClient integration. All API tests pass; this is test tooling, not a runtime API error.
- The Playwright runner's environment reports a `NO_COLOR` / `FORCE_COLOR` warning. It does not appear in the browser console.
- No real emergency-service integration, real-world sensing, operational validation or deployment is claimed. See README limitations for the simulation's deliberate simplifications.
