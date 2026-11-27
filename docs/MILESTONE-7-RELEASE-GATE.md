# TrafficGen — Milestone 7: Persistent Campaign Backend and Command Center Delivery

Date: 18 November 2026
Release state: local validated candidate, no GitHub push, no production changes

## What was actually built

- `api/campaign-gateway.js`: authenticated Vercel entry point for only the Campaign Lab API routes permitted by `src/campaign-routes.mjs`. Never accepts an arbitrary target URL.
- `src/campaign-gateway.mjs`: pinned Cloudflare Access tunnel origin, authenticated DGX worker token, explicit Content-Type checks, redirect rejection, capped request/response bytes and timeouts.
- `worker/dgx-queue.mjs`: authenticated `/campaign-api/*` relay to the Campaign API on DGX loopback, forwarding no user-provided hostname and no public worker credentials.
- `src/campaign-loopback.mjs`: loopback-only HTTP client with separate service token, strict route allowlist, limits and no-store responses.
- `src/worker-adapters.mjs`: optional local DGX adapter (`TG_CAMPAIGN_LOCAL_WORKER=1`) to avoid the external tunnel round-trip when both services run on the same DGX host.
- `public/app.js`: direct API from localhost, restricted Vercel Campaign Gateway from hosted deployment; `command-center/` is a separately namespaced static bundle that can be staged without replacing the existing production dashboard.
- Tests cover an actual local worker HTTP server and actual local SQLite-backed Campaign API, API authentication, method/path allowlists, stored campaigns, activations, dispatch acknowledgements, report export, stream limits and browser UI interactions.

## Trust and execution path

Browser → Vercel `/api/campaign-gateway?route=campaigns` (workspace `TG_API_KEY` verified) → Cloudflare Access → authenticated DGX queue `/campaign-api/campaigns` (worker token) → `127.0.0.1:18745/api/campaigns` (separate `TG_CAMPAIGN_SERVICE_TOKEN`) → durable SQLite Campaign API → localhost DGX queue for jobs. The Vercel service never writes a mutable SQLite database.

## Deployment prerequisites (not executed here)

- Current Vercel workspace key: `TG_API_KEY`, and existing protected worker tunnel settings: `DGX_API_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `TG_DGX_JOB_TOKEN`. Use existing protected environment settings; do not print values.
- DGX worker: `TG_DGX_JOB_TOKEN`, `TG_CAMPAIGN_SERVICE_TOKEN`, `TG_CAMPAIGN_PORT=18745`, and persistent `TG_QUEUE_DB` path. Run the updated queue only after its local tests pass on DGX.
- DGX Campaign API: set `TG_API_KEY` to the DGX-only `TG_CAMPAIGN_SERVICE_TOKEN`, use durable `TG_CAMPAIGN_DB`, set `TG_CAMPAIGN_LOCAL_WORKER=1`, and keep the service bound to 127.0.0.1 (never expose port 18745 publicly).
- Disabled scheduler by default: `TG_SCHEDULER_ENABLED=0`. Enable only after ownership, concurrency and daily budget verification. Scheduled credentials stored only as secrets in `TG_SITE_PROOFS_JSON`.
- Static Command Center can be placed at `/command-center/` with its versioned assets. The existing root website remains intact until a controlled cutover.
- GA4 remains production-observation-only until a separate QA property, `tg_run_id` dimension, QA measurement secrets and authenticated reporting account are configured and a QA run is reconciled.

## Test evidence

- Backend and integration: `docs/LOCAL-V7-CHROMIUM-TESTS.log` and final suite log.
- Browser interaction desktop/mobile: `docs/LOCAL-V7-VISUAL.log`.
- Only local synthetic fixture pages were visited. No production GA4 collection or audience metrics were generated.
- A separate optional loopback benchmark is available. It does **not** establish improvement over the current deployed TrafficGen or traffic-creator.com.

## Release blockers

1. Reconcile local overlay files into a full checkout and run the *original* GitHub repository CI and browser tests without publishing.
2. Install services on DGX using the established approved deployment procedure; verify authorized owned-site browser execution, worker heartbeats, cancellation and report integrity.
3. Verify the actual Vercel → Cloudflare Access → DGX Campaign API route with secrets in the target environment.
4. Configure and verify the isolated GA4 QA property. Transport acceptance does not mean GA4 report visibility.
5. Measure matched old/new DGX p50/p95 performance and safe resource use. Do not claim speed-up without measured baseline.
6. Finish operator authentication, service hardening and accessibility/security review before any production cutover.

No GitHub push, no merge to `main`, no Vercel deployment and no DGX service changes were made in this milestone.
