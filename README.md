# VisitorLab / TrafficGen

**API-first, authorized synthetic browser testing with GA4 diagnostics and optional DGX intelligence.**

Repository: `anantm9200/trafficgen`

## Running architecture

```text
CLI / authenticated API caller
          |
          v
Vercel API  -- owner proof via HTTPS --> verified website
          |
          +-- POST /api/validate     (check a bounded test plan and ownership)
          +-- POST /api/ga4-test     (validate GA4 Measurement Protocol format)
          +-- POST /api/dispatch     (queue an authorized GitHub Actions run)
          +-- GET  /api/runs         (real workflow statuses)
          +-- GET  /api/spec         (supported countries/devices/params)
          +-- GET  /api/health       (readiness)
          |
          v
GitHub Actions runner -- Playwright --> verified website
          |
          +-- visited pages, browser errors, broken images, durations
          +-- optional GA4 custom **synthetic** events
          +-- deterministic diagnostic analysis
          +-- optional DGX AI summary via trusted private HTTPS vLLM proxy
          |
          v
GitHub Actions JSON report artifact (14-day retention)
```

### Capability and limits

- Up to **25 browser sessions per request**, **3 concurrent browsers**, starts at least **6 seconds** apart, up to **4 pages per session**.
- Browser engines: Chromium, Firefox, WebKit.
- Device presets: desktop, iPhone, Android phone, iPad, Android tablet.
- Country profiles: US, IN, AE, DE, GB, FR, SG, AU, CA, ZA, NA, TZ.
- **Location profiles emulate browser locale, geolocation and timezone. They do not cause the source IP to originate in that country.** True international IP egress requires authorized workers hosted in those countries.
- Interactions: same-origin links, mouse wheel scrolling, hover, dwell/reading time, image checks. The worker refuses external navigation, state-changing HTTP methods and known sensitive URL patterns.
- Reporting: response codes, page navigations, request failures, JavaScript errors, images, p50/p95 and fail-stop.
- Synthetic GA4 custom event `visitorlab_synthetic_visit` using Measurement Protocol, with `tg_synthetic=1`, `traffic_type=internal`, run metadata, country/device profile and nine `tg_utm_*` values. **These are test metadata, not authentic Google acquisition/referral attribution.**
- No residential proxy rotation, anti-bot evasion, advertising clicks or disguised engagement.

## Vercel deployment

The project is connected to GitHub and automatically deploys pushes to `main`. Default `/` serves JSON health; no dashboard or frontend.

In Vercel project **trafficgen → Settings → Environment Variables**, configure:

| Variable | Where | Meaning |
|---|---|---|
| `TG_API_KEY` | Vercel / local | Strong randomly generated 24+ character bearer API key. Required for protected endpoints |
| `GITHUB_WORKFLOW_TOKEN` | Vercel | Fine-grained GitHub token scoped **only** to `anantm9200/trafficgen`, with **Actions: read/write**, so Vercel can dispatch and list workflows |
| `GA4_MEASUREMENT_ID` | Vercel and GitHub Actions Secrets | GA4 ID for your owned test property (e.g. G-XXXXXXXX) |
| `GA4_API_SECRET` | Vercel and GitHub Actions Secrets | GA4 Measurement Protocol API secret for that property's stream |
| `DGX_AI_ENDPOINT` | GitHub Actions Secrets or private worker environment | **Optional** authenticated HTTPS URL ending in `/v1/chat/completions`. Do not expose a private DGX service publicly |
| `DGX_AI_MODEL` | GitHub Actions Secrets or private worker | **Optional** model ID as served by the private vLLM gateway |
| `DGX_AI_API_KEY` | GitHub Actions Secrets or private worker | **Optional** gateway bearer token |

**Important**: Hosted GitHub Actions runners generally cannot reach DGX on Tailscale or a private network. For real DGX connectivity use a self-hosted runner inside the authorized private network or a TLS-terminated authenticated gateway with network access controls. Without DGX the worker still produces deterministic intelligence. This code does **not** configure or expose your DGX itself.

Configure the corresponding GitHub Actions secrets under **Repository → Settings → Secrets and variables → Actions** (GA4 and optional DGX). Do not commit credentials to this repository or put them in a plan.

After setting Vercel environment variables, redeploy to make them available. The `TG_API_KEY` is sent as `Authorization: Bearer ...` for protected API calls.

## Local development

Node.js 22 is recommended.

```sh
npm install
export TG_API_KEY="YOUR_RANDOM_SECRET_AT_LEAST_24_CHARACTERS"
export GITHUB_WORKFLOW_TOKEN="TOKEN_FOR_TRAFFICGEN_ACTIONS"
npm start
```

Health endpoint: `http://127.0.0.1:4174/api/health`. Only loopback interfaces are bound in the development server.

## Create a plan and verify ownership

```sh
node bin/trafficgen.mjs template plan.json
```

Edit `plan.json` with your website and `authorized: true` only after confirming ownership/written permission.

Publish a UTF-8 plain-text file at `https://YOUR_DOMAIN/.well-known/visitorlab-verify.txt` consisting of your plan's **exact** `verificationToken` on a single line. It must return HTTP 200 without redirects. This authorization check is repeated before the workflow dispatch **and** on the worker immediately before execution.

```sh
node bin/trafficgen.mjs validate plan.json
node bin/trafficgen.mjs dispatch plan.json
node bin/trafficgen.mjs runs
```

Set `TG_API_BASE=https://trafficgen-anant-icl.vercel.app` to target hosted API instead of local development.

To run locally without GitHub Actions:

```sh
npx playwright install chromium firefox webkit
node worker/run.mjs plan.json
```

Result saved to `reports/report-<runId>.json`; optional DGX intelligence is embedded in the same JSON.

## Example config (not authorized to execute)

```json
{
  "name": "Mobile and desktop QA",
  "targetUrl": "https://www.your-domain.com/",
  "authorized": false,
  "verificationToken": "tg_generate_random_token_from_cli",
  "sessions": 6,
  "concurrency": 1,
  "intervalSeconds": 8,
  "dwellSeconds": 15,
  "maxPages": 2,
  "countries": ["AE", "IN", "US"],
  "devices": ["desktop", "iphone", "android"],
  "browser": "chromium",
  "interactions": {"scroll": true, "hover": true, "navigate": true, "checkImages": true},
  "analytics": {
    "enabled": false,
    "measurementId": "G-EXAMPLE123",
    "utm": {
      "utm_source": "visitorlab",
      "utm_medium": "synthetic_test",
      "utm_campaign": "qa_prelaunch",
      "utm_id": "qa_run_001",
      "utm_term": "",
      "utm_content": "iphone",
      "utm_source_platform": "visitorlab",
      "utm_creative_format": "",
      "utm_marketing_tactic": "quality_assurance"
    }
  }
}
```

For GA4 enable `analytics.enabled`, set a real `measurementId` matching `GA4_MEASUREMENT_ID`, configure both GA4 secrets, and run `node bin/trafficgen.mjs ga4-debug plan.json` to validate payload structure without creating a normal event. Google may accept HTTP transport while rejecting/processing an event asynchronously; a successful response is not proof of reporting.

**GA4 reporting configuration:** To use `tg_utm_*` fields in Google Analytics reports, register the desired event-scoped custom dimensions in your GA4 property. These must be registered by an authorized Google Analytics administrator. A Measurement ID alone cannot create admin-level custom dimensions. Prefer a dedicated QA property or filtered/internal traffic to protect production analytics.

## DGX intelligence

After browser tests, `src/intelligence.mjs` computes deterministic findings from observed errors and timings. When all three `DGX_AI_*` environment variables are configured, the worker securely sends **sanitized aggregate results** to a private HTTPS OpenAI-compatible vLLM chat endpoint. It receives a short evidence-grounded diagnostic summary and suggested next tests. No browsing credentials, page text, cookies or visitor personal data are transmitted to DGX.

AI output is advisory only: it cannot dispatch additional tests or change traffic, country attribution, safety limits, or targets.

## Security, constraints and known gaps

- Only tested/verified public HTTPS DNS hosts (no IP literal, private network or localhost targets).
- HTTPS owner verification is DNS-checked and pinned to a validated public resolved IP to reduce DNS rebinding.
- Authenticated bearer API. No secrets in GitHub code. Re-verify ownership per job.
- Vercel is a **control plane**, not a durable browser worker or data store. Reports are currently GitHub artifacts, not database records.
- No login/dashboard, shared workspace, cloud result database, distributed country egress, full mobile real-device cloud, billing, or remote cancellation. Those require additional infrastructure.
- Never run unauthorized tests or use synthetic events to misrepresent authentic users, organic acquisition, conversions or ad performance.

## Tests

```sh
npm test
```

CI checks configuration validation, public target safeguards and GA4 synthetic event shape; it does not run the browser against a public site without an ownership proof.
