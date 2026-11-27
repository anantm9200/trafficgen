# TrafficGen Release Candidate — Local Engineering Gate

**Date:** 18 November 2026
**Deployment status:** NOT deployed. Original GitHub `main` and production untouched.
**Source:** Based on `trafficgen-milestone7-persistent-command-center-local.zip`, reconciled locally with the prior campaign and worker modules.

## Engineering work completed in this checkpoint

1. **Autonomous run monitoring:** Persistent Campaign API polls a maximum of 3 active DGX jobs every 30 seconds even without an open dashboard. It validates worker identity, report run ID and synthetic classification; it does not dispatch additional jobs or fabricate completion.
2. **Isolated GA4 QA property binding:** A reporting response must match the numeric QA property configured for the service. Events can only be sent after an authenticated Google Analytics Admin API check proves the QA measurement stream belongs to that separate property.
3. **GA4 QA performance:** One request can transport 1–25 clearly marked QA events, reducing prior sequential requests while preserving exactly-once attempt and no-auto-retry behavior. HTTP acceptance is NOT recorded as report visibility.
4. **Release preflight:** Offline source and credential-presence checks, plus an optional read-only live readiness probe. Neither prints tokens nor sends traffic.
5. **Non-destructive integration:** A local-only integration script overlays the new modules into a separate cloned checkout while preserving the existing production root dashboard and original `npm test` entrypoint.
6. **Tests:** Full local suite, browser visual checks, syntax validation, and overlay integration fixture. See `RELEASE-CANDIDATE-UNIT-TESTS.log`, `RELEASE-CANDIDATE-VISUAL-TESTS.log`, and `RELEASE-CANDIDATE-BROWSER-BENCHMARK.log`.

## What is **not** yet verified

- A complete merged checkout of `anantm9200/trafficgen` passing the pre-existing CI and browser smoke tests **together with** the new tests. The actual repository is connected in GitHub but is not mounted here as a local clone; the release overlay is not a substitute for that gate.
- Installation of the latest queue and Campaign API on the actual DGX Spark with durable volumes, secrets, systemd service startup and restart checks.
- Vercel preview environment → Cloudflare Access → DGX queue → loopback Campaign API tested using the real protected network and credentials.
- An authorized real browser journey completing on DGX with a valid worker report after this code is deployed.
- A dedicated, configured QA GA4 property and custom event-scoped `tg_run_id` dimension; verification of actual event visibility using its service account.
- Equivalent old/new workload benchmark on the DGX with real CPU, RAM, queue wait p50/p95, and page timings. Local browser fixture benchmarks are not a claim of improvement over Traffic Creator or deployed TrafficGen.
- Production security review, accessibility review across all original pages, and an observed rollback plan.

## Deployment prerequisites (do not paste secret values into chat)

- **Vercel preview:** existing `TG_API_KEY`, `DGX_API_URL`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `TG_DGX_JOB_TOKEN`.
- **DGX worker:** `TG_DGX_JOB_TOKEN`, `TG_CAMPAIGN_SERVICE_TOKEN`, persistent `TG_QUEUE_DB`, Chromium, Node 22+, optional `TG_WORKER_PORT` (default 18743).
- **DGX campaign API:** `TG_API_KEY` equal to the DGX-only `TG_CAMPAIGN_SERVICE_TOKEN`, `TG_CAMPAIGN_LOCAL_WORKER=1`, `TG_CAMPAIGN_DB` on persistent storage, `TG_SCHEDULER_ENABLED=0` until owned-site checks pass; loopback port 18745 only.
- **GA4 QA:** `GA4_PRODUCTION_MEASUREMENT_ID`, distinct `GA4_QA_MEASUREMENT_ID`, `GA4_QA_API_SECRET`, `GA4_QA_PROPERTY_ID`, `GA4_QA_SA_EMAIL`, `GA4_QA_SA_PRIVATE_KEY`. Give the service account read access to the QA property and enable the GA4 Admin/Data APIs. Register event-scoped custom dimension `tg_run_id` on the QA property.

## Release order after prerequisites exist

1. Make a **separate local clone** of the original repository. Apply `scripts/integrate-local-release.py` to a different output directory; verify the original root dashboard is unchanged.
2. Run **both** the original repository CI tests and `test:campaign`; install dependencies on Node 22. Run Chromium smoke tests and inspect all page layouts.
3. Run the read-only live readiness probe with approved environment settings. A green probe alone is not sufficient.
4. Install the two persistent services on DGX in a maintenance window, with restricted 127.0.0.1 listeners, controlled secrets and rollback snapshots. Keep the scheduler off.
5. Test one verified, explicitly synthetic owned-site journey end-to-end through the protected gateway; confirm queue lifecycle, browser report and cancellation.
6. Use **only the separate GA4 QA property** for one controlled synthetic event batch; reconcile it via the authenticated reporting API after the processing delay.
7. Benchmark matched loads and verify resource headroom. Fix actual errors, then cut over the command center to a preview, followed by a controlled production release and a tested rollback.

**Policy:** No simulated production GA4 audience inflation, anti-bot evasion or third-party ad traffic. All browser execution is authorized, synthetic-labelled site QA.
