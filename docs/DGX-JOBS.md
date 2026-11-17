# DGX job queue — preview rollout

The Cloudflare Access tunnel and Vercel health proxy are already verified. This adds the job API, SQLite persistence, bounded Playwright execution, cancellation and report retrieval.

## One-time shared secret (do not paste into chat)

On the DGX, generate a 48-byte random token:

```bash
cd ~/trafficgen
umask 077
mkdir -p .data
if [ ! -f .data/dgx-job-token ]; then openssl rand -hex 48 > .data/dgx-job-token; fi
chmod 600 .data/dgx-job-token
```

In Vercel project `trafficgen`, add `TG_DGX_JOB_TOKEN` as a sensitive **Preview** environment variable, with the **exact contents** of `.data/dgx-job-token`. Never put this token in Git, the dashboard or browser. Redeploy the feature-branch preview after saving it.

## Install on DGX

```bash
cd ~/trafficgen
git pull --ff-only
npm install
npm test
node --check worker/dgx-queue.mjs
```

Stop the existing **health-only** worker bound to 127.0.0.1:18743, then launch the new worker from the repository root. The queue uses the same port, so the Cloudflare route stays unchanged:

```bash
cd ~/trafficgen
TG_DGX_JOB_TOKEN="$(cat .data/dgx-job-token)" node worker/dgx-queue.mjs
```

For unattended operation, configure a systemd unit with `WorkingDirectory=/home/dgxadmin/trafficgen`, `ExecStart=/usr/bin/node worker/dgx-queue.mjs`, `EnvironmentFile=/home/dgxadmin/trafficgen/.data/worker.env`, `User=dgxadmin`, `Restart=on-failure`, `RestartSec=5`, and `NoNewPrivileges=true`. Create the environment file with `TG_DGX_JOB_TOKEN=<secret>`, permissions 0600. Never run both the old and new workers on port 18743. Adjust the Node executable path if `command -v node` is not `/usr/bin/node`.

## Verification

```bash
curl -fsS http://127.0.0.1:18743/health
```

Expected `mode:job-queue`. The authenticated Vercel preview should return `GET /api/dgx-jobs` as `{ok:true,jobs:[]}` before the first job.

## Safeguards

- DNS/HTTP ownership verification at Vercel and again on DGX.
- Max 25 sessions/job, one browser at a time, max 10 pending jobs.
- SQLite persists jobs across restarts; interrupted jobs are marked failed.
- Job execution runs as a subprocess, allowing cancellation.
- Analytics ingestion disabled for DGX queue; synthetic traffic remains labeled.
- Queue is not public: Cloudflare Access plus a separate DGX job bearer secret.
- No automatic deployment to production. Test the preview before merging.

## Limitations

Cancellation sends SIGTERM to the child process; reports are only complete when the worker finishes normally. This is a first implementation, not a tested high-availability service. If worker exits during a job, the job is marked failed on next startup. The DGX worker must have Playwright Chromium installed. Keep concurrency at one while other DGX workloads run.
