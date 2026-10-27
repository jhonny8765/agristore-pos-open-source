# Availability and encrypted-backup verification — October 28, 2026

## Verified implementation

The new read-only `agri_service_health` probe inspects only command availability/permissions and returns a boolean. It grants no anonymous business-command or table access. The uncached server health route uses explicit public database configuration, a five-second timeout and minimal 200/503 responses; raw upstream errors and credentials are omitted.

The monitor has separate website and database-only modes, three attempts, strict HTTPS-origin validation and no raw response/credential logging. Website mode rejects redirects, HTML, stale/future responses and wrong service/version. Database-only mode accepts only the boolean read-only RPC and a modern public publishable key; output explicitly excludes website verification.

The streaming encrypted-archive tool authenticates the file with AES-256-GCM, refuses overwrite, publishes only completed output and reports a digest. A failed decryption leaves no target plaintext. Keys are separate inputs; no production key is generated, copied into source or uploaded. Interrupted `.partial-*` files must not be treated as valid archives. The CI restore now decrypts and authenticates its complete disposable `pg_dump` before feeding it to the existing full 40-table functional restore.

## Tests and deployment

- Local type/lint, 357 unit tests and production build passed for the application/encrypted-restore release.
- Full [CI run 40596621851](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40596621851) passed on `d4f38f9921d77c145610b517c30681fe46a58dbd`: 25 practice browser cases, 52 genuine Supabase/Auth browser cases, 819 pgTAP assertions across 18 files, strict database lint and an authenticated encrypted-dump restoration with all 40 table content fingerprints and subsequent functional checks.
- The database-only monitor follow-up passed type/lint and all 362 local unit tests. It changed monitoring tooling/tests only; the application and migration above stayed unchanged. Its real [cloud probe run 40598341268](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40598341268) succeeded on `a6f74be89b38d3b8f241c8a56b437d7d5ffb7d79`.
- The monitor's Node 20 helper warning was resolved by pinning official `actions/checkout@v7.0.1` and `actions/setup-node@v7.1.0`, both using native Node 24. The [final cloud run 40598963371](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40598963371) passed on `8aff17ae51d17dc079c7734b466234be3c4693af`; the workflow is active and its current mode/enabled/public-key configuration was read back. No private database or Vercel bypass key is stored in that runner.
- Wrong keys, corrupted ciphertext/tag, truncated files, invalid keys, empty/same-file input and existing output were rejected. A complete encrypted/decrypted dump matched the original bytes and digest before database restoration.
- The labelled [notification test 40597105356](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40597105356) intentionally failed. The user confirmed its email arrived. It caused no store outage. The existing GitHub failed-workflow email preferences were retained; no other notification routing was changed.
- Staging initially lacked explicit database variables and the new route correctly failed closed. Its existing public connection was configured for Preview only, then rebuilt as READY deployment `dpl_ySrYbPEwKFBAgWoALENG6jaunLHp` from private application source `b021bc86833a2042933c01bbf6d1f88c9d28d825`. The authorized browser confirmed a fresh `status: ok`. The stable staging alias was independently verified against that exact deployment/project/source.
- The single new health-function migration preserved all 40 hosted business-table counts/content hashes. Final comparison matched all 400 original test payloads, 400 payments, 400 sale stock movements, ₱3,850 combined simulated cash, 140 kg, zero open shifts and four unchanged other-branch sales.

## Current operating scope and remaining work

Database-only checks are enabled in the free public-source runner, roughly every fifteen minutes. The first real cloud validation was a manual dispatch; an actual periodic scheduled invocation has not yet been observed. Confirm the last successful run daily and account for GitHub delays/inactivity disabling. Email delivery was confirmed by the user.

Vercel-protected staging redirects unauthenticated website requests to sign-in. That protection remains intact. Full website monitoring waits for a public production endpoint or an explicitly approved access method; a database-only green result must not imply that the protected website or branch queues were checked. Independent missed-monitor heartbeat alerts and automatic branch-queue/missed-backup escalation remain unconfigured.

The linked provider backup audit returned no listed recoverable entries and point-in-time recovery disabled. It does not establish that no internal provider copies exist. No production backup, schedule, off-site archive, recovery-key custody or actual production-backup restore is certified. This release tests the encryption/restore pipeline with disposable fixtures. Native dump/Docker tools were unavailable on this PC; no installer, paid plan or off-site data upload was performed.

Follow [the backup and availability procedure](backup-and-availability.md). Actual production project/capacity/costs, backup destination/key custody/retention/recovery targets, hardware endurance, verified inventory, independent staff and owner-approved one-branch pilot still need evidence. The physical long test remains postponed.
