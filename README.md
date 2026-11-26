# VisitorLab / TrafficGen

## QA analytics isolation (pending verification)

Normal GA4 Measurement Protocol collection is disabled pending independent verification of a dedicated QA property. GA4 debug validation remains available. Earlier configuration examples below are historical and do not authorize production event submission. Known collection endpoints are blocked, but first-party analytics proxies and server-side site logging may still observe requests. Use a dedicated staging site for clean isolation. Public report URLs omit query strings and fragments; paths and other diagnostic fields can still contain sensitive information, so review reports before sharing.

## Web dashboard (production)

**Verified production URLs:** https://trafficgen-ua6y.vercel.app/ and https://trafficgen.vercel.app/. Both names are attached to the same connected Vercel TrafficGen project. The user-designated hostname was attached and validated on November 17, 2026.

**Reliability:** The project now has an hourly GitHub Actions production check at `.github/workflows/hourly-health.yml` plus mandatory JavaScript syntax gates and a real Playwright Chromium dashboard regression test. Hourly checks monitor both production hostnames and fail for broken JavaScript or API responses. GitHub scheduling can be delayed; these automated checks do not automatically write new features.

**Google integrations:** Synthetic website visits can send explicitly named GA4 Measurement Protocol test events when the owned `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` are configured. Search Console does not ingest ordinary test visits or manufacture organic Google Search impressions/clicks; use verified Search Console properties for legitimate indexing, sitemap and search-performance checks.


The frontend is available at **https://trafficgen.vercel.app/**, with Overview, New Test, Campaigns, Run Monitor, Analytics, Websites, Device Lab, and Integrations. The dashboard is the verified responsive preview promoted by GitHub integration. The existing `/api/*` endpoints remain in place.

Dashboard campaigns and imported reports live in browser localStorage; API keys entered under Integrations live only in sessionStorage for the current tab. The dashboard shows actual workflow runs only when authenticated, and never fabricates analytics.

**Execution prerequisites:** API auth is configured on Vercel. One-click workflow dispatch requires a separately configured `GITHUB_WORKFLOW_TOKEN`. GA4 and DGX are optional and require their own explicitly authorized credentials. Verified target ownership is mandatory. Until these are connected, the respective controls display actionable errors instead of pretending to execute.



**Responsive dashboard + authenticated API + authorized synthetic browser-testing worker, with GA4 diagnostics and optional DGX intelligence.**

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

## Falling Shares — TrafficGen testing stream

For `https://www.fallingshares.com/`, the owner-designated **TrafficGen testing** destination is the **existing** GA4 Measurement ID `G-E3DFWFZ3YT` (the website currently loads GTM `GTM-TDGW33GH`). Selecting the verified Falling Shares domain in TrafficGen now pre-fills that Measurement ID; this is an owner-provided mapping, not an auto-detection claim.

- The existing GTM container and GA4 stream are unchanged. Label the property as testing in GA4 Admin if desired; the code cannot rename it or stop real visitors also being counted there. Historical GA4 data remains intact.
- TrafficGen's server-side synthetic events remain labelled `visitorlab_synthetic_visit`, `tg_synthetic=1` and `traffic_type=internal`; they are not authentic customer acquisition.
- Browser-generated `page_view` and `session_start` from GTM can also appear in this same stream. Treat the entire stream as testing/mixed data, not clean organic traffic.
- A server-side test event requires `GA4_MEASUREMENT_ID=G-E3DFWFZ3YT` plus the **matching private** `GA4_API_SECRET` in the execution worker's secret settings. The ID alone is insufficient. Never commit the secret.
- Before genuine acquisition measurement is needed, create a separate production property and route real visitors to it. Two unconditional tags would duplicate tracking rather than separate it.

## Vercel deployment

The project is connected to GitHub and automatically deploys pushes to `main`. Default `/` serves the interactive dashboard. JSON health remains at `/api/health`.

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

## GitHub-native execution without an API dispatch token

Because GitHub Actions is already connected to this private repository, you can **commit an authorized plan** to `plans/active.json` on `main` and GitHub Actions will run the verified browser worker automatically. No `GITHUB_WORKFLOW_TOKEN` is needed for this GitHub-native route.

1. Generate a plan with `node bin/trafficgen.mjs template plan.json`.
2. Edit the target, publish the verification file and set `authorized:true` after securing permission.
3. Commit the JSON as `plans/active.json` using a normal authenticated GitHub push.
4. Review the **Verified synthetic browser test** workflow and download its `visitorlab-report` artifact.

The API `POST /api/dispatch` remains available if you later add a fine-grained `GITHUB_WORKFLOW_TOKEN`; it is **not required** for plan-on-push execution. The same target ownership check and session limits apply to either route. Never commit credentials or real visitor data to the plan.

## Create a plan and verify ownership

```sh
node bin/trafficgen.mjs template plan.json
```

Edit `plan.json` with your website and `authorized: true` only after confirming ownership/written permission.

Add a **DNS TXT record** for the exact target hostname. For `https://www.your-domain.com/`, set the name to `_visitorlab.www.your-domain.com` (or the relative hostname expected by your provider), and the TXT value to `visitorlab-verification=<your verificationToken>`. Suggested TTL is 300 seconds. Set `verificationMethod: "dns_txt"` in the plan. The platform rechecks the TXT record before each authorized test and browser run; no website file is required.

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
  "verificationMethod": "dns_txt",
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

## Verified, on-demand website inspection

The dashboard now supports a **real HTTP site inspection** without requiring the GitHub workflow-dispatch token:

1. Open **Websites**, enter your public HTTPS hostname, and copy the automatically generated DNS TXT record name and value.
2. Publish the record at your DNS provider. Select **Save DNS setup** to keep the pending registration, then **Verify TXT & detect GA4** once DNS has propagated.
3. Click **Verify TXT & detect GA4**. This step no longer requires an API key. If verification fails, the public DNS-status check distinguishes missing TXT records from a saved-token mismatch.
4. Select the verified domain in **New test** and choose **Run live site inspection** at the Review step.
5. Review the measured response status, elapsed duration, HTML title, description, H1 headings, image alt indicators, canonical, robots directive and security headers. See **Analytics → Verified site inspections** for saved observations and JSON exports.

Backend: `POST /api/site-verify` verifies the DNS TXT record **without a bearer API key** and performs one bounded passive GA4/Tag Manager inspection of the initial HTML response (no JavaScript execution). It requires the TXT proof first, refuses private addresses, and applies best-effort per-instance throttling. `GET /api/dns-status?hostname=example.com` provides token-free, read-only DNS propagation diagnostics without exposing TXT verification values. It reports detected `G-` IDs separately from `GTM-` containers and does not establish whether analytics events are actually received. Verified domains are saved locally and reused in campaigns without reentering a token. Ownership is still rechecked by the server on every protected action.

Backend: `POST /api/inspect`, authenticated with `Authorization: Bearer TG_API_KEY`, accepts the same bounded plan used by `/api/validate`. It checks the public domain and ownership proof, pins the site's HTTPS request to a publicly resolved IP, refuses redirects, refuses unsafe URLs and limits page data to 512 KiB. It performs **one synthetic-tagged HTTP GET**; it does not pretend to be a human browser or count as a browser test session.

You can also save incomplete campaign drafts and restore a previously exported workspace JSON. Existing browser reports remain separate from inspected-page diagnostics.

All Vercel functions remain subject to configured credentials. **Full Playwright browser journey dispatch** still requires `GITHUB_WORKFLOW_TOKEN` (or GitHub-native plan-on-push). **GA4 custom events** require a GA4 property and Measurement Protocol secret; **DGX** requires authenticated private connectivity.

### Hourly and end-to-end checks

`TrafficGen Hourly Health` checks both production aliases, required dashboard controls, JavaScript/CSS assets, JS parseability, JSON API schema, and anonymous rejection by the protected API. Separately, GitHub Actions Chromium tests exercise real UI interactions against an isolated controlled fixture on pull requests and relevant pushes. Neither check fabricates Google Search Console data.

## Legacy website verification

Older plans that explicitly set `verificationMethod: "http_file"` can still use the previous `/.well-known/visitorlab-verify.txt` proof, but the user interface uses DNS TXT onboarding only. Older saved campaigns will be shown as pending until the TXT record is configured; no unverified site is silently trusted. TXT ownership proof is public; production access still requires the private `TG_API_KEY` and authorization.
