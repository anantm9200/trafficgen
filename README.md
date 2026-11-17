# VisitorLab · Synthetic website testing

VisitorLab is a Vercel-hosted control panel for **authorized synthetic website testing**. It includes an original responsive dashboard, a six-step campaign builder, website ownership checks, single-request live diagnostics, analytics from real run records, device and geography emulation settings, JSON exports, and a separate Playwright browser worker for bounded, identifiable test journeys.

## Architecture

- **Vercel**: dashboard and short-lived `/api/diagnose` endpoint. No persistent long-running browser jobs on Vercel.
- **Browser storage**: campaign configuration, website list, and result history are local to this browser. They are not shared between devices or users.
- **Optional local/VM worker**: `worker/run.mjs` runs authorized Playwright tests from exported plans. Regional IP origin requires workers actually hosted in each selected country; changing timezone/locale does not change IP origin.

## Start

`npm install` then `npm run dev`. The dashboard will be at `http://localhost:4174`. `npm test` runs the unit tests. Vercel serves the root static assets and serverless endpoint directly.

## Website verification

For every live diagnostic or browser run, publish a **plain-text** file at `https://your-site/.well-known/visitorlab-verify.txt` containing the exact verification token shown in the campaign wizard. The diagnostic endpoint reads it over HTTPS, with no redirects, before making one HEAD request to the site. Private networks and unsafe addresses are excluded. Only test websites you own or have written permission to assess.

## Local browser worker

Export a plan from the Review step. Install Playwright browser executables using `npx playwright install chromium firefox webkit`, then run `node worker/run.mjs ./plan.json`. The CLI refuses live execution without successful site verification, caps traffic to 100 sessions at 4 concurrent, and spaces starts at least 3 seconds apart. Its results are stored locally as JSON. Vercel **does not** execute this worker.

## Limits and transparency

All test requests are marked with `x-synthetic-test: visitorlab` when same-origin, and analytics hosts are blocked to avoid corrupting acquisition metrics. The system does not bypass bot protections, mimic search clicks, rotate residential proxies, spoof referrals or fabricate engagement in advertising/analytics platforms. Region selectors represent **browser locale, timezone and geolocation** unless separate authorized workers are provisioned. Full user accounts, durable cloud storage, remote worker orchestration and shared dashboards are not yet implemented.

## Deployment

Import `anantm9200/trafficgen` into Vercel as an **Other** project, root `/`, no build step. Pushes to `main` redeploy automatically. Enable Vercel Authentication/Deployment Protection for private use. Do not expose the tool as a public traffic-generation service without user authentication, verified-ownership enforcement and server-side rate limits.

## Credits

Original UI and code; reference workflow inspiration from publicly viewable traffic-creator.com and a user-provided screen recording, not copied design assets or source code.
