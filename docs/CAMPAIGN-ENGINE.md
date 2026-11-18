# TrafficGen — Campaign testing engine implementation contract

Reference product: https://traffic-creator.com/ (publicly advertised features; not an assertion about its private implementation).

## Product boundary
TrafficGen is an authorized, synthetic browser and analytics QA platform. Synthetic sessions are not genuine customers, organic acquisition, ad clicks, ranking signals, or evidence of demand. Never disguise automated sessions as humans or route traffic to bypass analytics/bot detection. Do not send synthetic traffic to ad monetization or third-party properties.

## Functional modules and acceptance criteria

### 1. Campaign builder
- Verified domain and URL scope required before dispatch.
- Browser profile: desktop/mobile/tablet, viewport, locale and timezone. Show separately the **actual network egress region**; emulated locale does not equal IP geolocation.
- Journey: landing page, same-origin navigation, scroll, dwell, allowed interactions, maximum pages, stop conditions.
- Pacing: sessions per interval, maximum concurrency, run window, daily budget, pause/resume/cancel, idempotent dispatch.
- Acceptance: invalid/unverified site or out-of-scope navigation is rejected at API and worker.

### 2. DGX browser execution
- Queue state machine: queued, running, completed, failed, cancelled; include attempt ID and timestamps.
- Concurrency 1 by default; explicit safe caps; worker startup recovery; job cancellation terminates child processes.
- Browser reports: requested URL, final URL, HTTP status, DOM readiness, navigation timings, console errors, failed resources, screenshots when authorized.
- Acceptance: a single owned-site test completes end to end and report can be downloaded from the dashboard.

### 3. Analytics observation (production-safe)
- Browser loads ordinary tag scripts but blocks collection endpoints during synthetic production observation.
- Record sanitized request metadata: provider, event type, timestamp, request attempted/blocked; never capture analytics credentials or sensitive query values.
- Distinguish: observed browser request, blocked network request, accepted QA event, GA4 report-visible event.
- Acceptance: test with an instrumented site demonstrates tag detection without adding synthetic visits to production GA4.

### 4. Analytics delivery verification (isolated QA)
- Require an explicitly designated **separate GA4 QA property** and verified ownership; no production measurement ID allowed.
- Add unique synthetic run identifier and explicit synthetic event classification; consent rules apply.
- Verify GA4 receipt/report visibility using authorized GA4 APIs when available. Do not equate HTTP success with GA4 processing or counted sessions.
- Record submitted, accepted, processed and visible as distinct statuses, including latency and rejection reasons.
- Vercel Analytics: report tag/request evidence and filtering limitations; do not promise that bot traffic appears in production dashboard.
- Acceptance: controlled QA property receives expected test events and the run report reconciles counts.

### 5. Campaign reporting and monitoring
- Show sessions planned/started/completed/failed, journey success, errors, latency distribution, provider evidence and QA reconciliation.
- Never label synthetic sessions as real users, organic visitors, conversions or revenue.
- Export JSON and CSV with explicit synthetic labels.
- Acceptance: all displayed numbers derive from stored run evidence, not projected or invented counts.

### 6. Operations
- 30-minute GitHub Actions quality watch checks API health, tests and syntax without dispatching browser visits.
- DGX worker heartbeat and queue health checks; alert on failures and stalled jobs; bounded retries.
- CI tests: authentication, verified-domain enforcement, blocked third-party navigation, queue lifecycle, cancellation, report consistency and QA analytics isolation.
- Acceptance: one fully observed browser run and one QA analytics reconciliation test pass before declaring production-ready.

## Delivery order
1. Fix any current browser dispatch/run/report defects; instrument the existing DGX queue.
2. Build reliable browser job lifecycle and campaign dashboard.
3. Implement isolated GA4 QA event receipt and reconciliation.
4. Add pacing, schedules, pause/resume, source/geo/device reporting with truthful egress labels.
5. Add optional crawler, operational alerts, export and UI polish.

## Out of scope
- Residential proxy routing intended to misrepresent synthetic visits as organic human traffic.
- Production GA4 audience inflation or anti-bot evasion.
- Advertising click/impression simulation or fake conversion/revenue generation.
- Copying another product's proprietary code, branding, or exact visual assets.

## Performance and efficiency targets (engineering objectives, not measured results)

- **Dispatch latency:** p95 under 2 seconds from authenticated API acceptance to durable queue acknowledgement, excluding WAN outages.
- **Queue pickup:** p95 under 5 seconds while worker is idle; expose queue wait time separately from browser startup.
- **Browser reuse:** prefer a warm Chromium process with isolated per-job contexts, when proven safe and memory-bounded. Do not reuse cookies or storage between jobs.
- **Concurrency:** start at one; benchmark CPU, RAM and site impact before raising. Apply strict per-domain rate limits and global resource budgets.
- **Job lifecycle:** heartbeat every 15 seconds; mark stalled jobs and apply bounded retry only to idempotent operations; support cancellation.
- **Report efficiency:** stream compact structured events; cap retained request evidence, avoid storing sensitive URL parameters, compress historical artifacts and enforce retention.
- **Operational observability:** report p50/p95 queue wait, browser startup, navigation time, completion, failure cause, memory high-water and worker restarts.
- **Analytics QA:** batch read-side reconciliation where API quotas permit; avoid unnecessary polling and never claim event processing before it is observed in the isolated QA property.
- **Cost:** default to existing DGX/Vercel/GitHub resources and zero paid services; monitor egress and GitHub Actions minutes.
- **Security:** bounded same-origin journeys, explicit verified-site allowlist, outbound restrictions, anti-SSRF and isolated QA analytics destination.

### Release performance gate
Capture a baseline from 20 authorized QA journeys on a controlled website, then compare identical workloads after each optimization. No performance claim is accepted without measured p50/p95 timings, success rates and resource use. No bulk synthetic sessions to production analytics.
