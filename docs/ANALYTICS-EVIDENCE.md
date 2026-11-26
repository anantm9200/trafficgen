# Analytics evidence: phase 1

The Playwright worker now observes browser-generated GA4 and Vercel Analytics collection requests and includes a per-session `analyticsRequests` list and `analyticsSummary` in JSON reports. The summary includes observed requests and event types, not confirmed analytics ingestion.

For safety, analytics collection endpoints remain blocked in this phase. The browser can load supported GA4 and Vercel tag scripts, but collection traffic is not forwarded. This prevents synthetic testing from altering production audience metrics. Normal Measurement Protocol collection is disabled until a separate QA destination is independently verified. The debug validation endpoint remains available. Known browser collection endpoints are blocked, but first-party collection proxies and server-side site metrics cannot be ruled out by this alone. Use a dedicated staging site with analytics disabled or independently isolated.

## Next milestones

1. Configure an isolated QA analytics destination and consent-aware allowlisting; never silently forward events to a production property.
2. Add provider-side ingestion checks using authorized read-only APIs, distinguishing network transmission from reported data.
3. Build an authenticated outbound DGX worker that polls a durable job queue, with cancel, quotas, target verification and concurrency controls.
4. Add dashboard reports and run-by-run comparisons of browser actions, observed events and provider-confirmed events.
5. Benchmark controlled load before scaling; preserve synthetic labels and avoid production conversion contamination.

No DGX connection, queue, production analytics delivery, or 50,000-session capacity is claimed by this change.
