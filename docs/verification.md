# Verification record

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
