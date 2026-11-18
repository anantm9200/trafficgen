# DGX Spark setup (ARM64)

Current branch: `feature/analytics-evidence-v1`

## Authentication

Use a read-only GitHub SSH deploy key for this private repository. Clone via a configured SSH host alias; never put tokens in shell history.

```sh
mkdir -p ~/trafficgen
cd ~/trafficgen
git clone git@github-trafficgen:anantm9200/trafficgen.git .
git checkout feature/analytics-evidence-v1
```

## Dependencies

This repository currently has **no committed package-lock.json**, so `npm ci` cannot work. Use `npm install --no-audit --no-fund` to resolve dependencies. That command generates a local package-lock.json. A reviewed lockfile should be committed to the repository before unattended production deployments.

```sh
cd ~/trafficgen
npm install --no-audit --no-fund
npm test
```

## Local health check first

No browser install is required to check the health-only service.

```sh
TG_WORKER_PORT=18743 node worker/dgx-health.mjs
```

In a second terminal:

```sh
curl -fsS http://127.0.0.1:18743/health
```

The service binds to loopback only and does not dispatch jobs or modify models.

## Chromium on ARM64

After dependencies are installed, `npx --no-install playwright install chromium` installs the browser build matching the local package. Do not install Playwright globally or independently through `npx` before project dependencies; that may select a different version. A previous incomplete browser download can be retried safely.

The Spark showed 30 GiB available RAM but heavy swap use during initial checks; do not run high-concurrency browser jobs yet. Start with a single Chromium instance after resource verification.

## Integration status

- GitHub deploy key, repository clone: user verified.
- DGX health service: code exists, runtime verification pending.
- DGX queue, authenticated polling, scheduled runs, analytics provider ingestion: not yet implemented.
- Analytics collection observed in the test browser is currently isolated from production reporting.
