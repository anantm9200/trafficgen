# TrafficGen public-product comparison — 26 November 2026

Sources: https://traffic-creator.com/ ; https://traffic-creator.com/blog/new-traffic-creator-dashboard ; https://github.com/morluto/rea ; TrafficGen main commit d2ce30443fe21296fd1dfdcbba0eb9cdd90db37a.

REA is an analysis toolkit, not the competitor's source. This is a public feature comparison, not a verified reconstruction of the competitor's backend. No third-party code was imported.

| Area | Existing implementation | Remaining QA work |
| --- | --- | --- |
| Campaign dashboard | browser localStorage, authenticated API | durable workspace and report retention |
| Browser journeys | bounded Playwright tests, verified ownership | controlled staging fixtures and explicit journey assertions |
| Regional/device testing | locale/timezone/geolocation profiles and device presets | label profiles accurately; no claim of IP origin |
| DGX | SQLite queue, status, cancellation endpoints | isolated integration tests and operational evidence |
| Analytics | request observation, debug endpoint | independent QA-property verification and read-side reconciliation |
| Reporting | JSON reports and diagnostic summaries | redaction review and offline report comparisons |
| Monitoring | CI, hourly health workflow | verify alerting and release evidence |

This change rejects unsafe initial paths and inherited profile keys, removes URL query/fragment values from public plan and browser URL evidence, and blocks normal GA4 collection while leaving debug validation available. Remaining risks include first-party collection proxies, redirects, and diagnostic text containing sensitive data. No production audience inflation, simulated acquisition attribution, search clicks, proxy evasion or paid-ad activity is included. Do not use production sites as a substitute for dedicated QA isolation.
