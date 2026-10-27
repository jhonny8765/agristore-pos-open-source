# AgriStore POS

Open-source cash checkout and auditable stock controls for agricultural stores. TypeScript, Next.js, Supabase/PostgreSQL, Dexie and Workbox. MIT licensed; dependency licenses remain their own.

This edition contains generic branding and synthetic fixtures. It includes no private store data, deployment credentials, business artwork or original private development history. It does not connect to a hosted business by default.

## Features

- Cash checkout in Philippine pesos, integer centavos, exact sack/kg conversions, fractional weights and actual-weight confirmation for peso requests.
- Offline checkout for an already authorized cashier/shift, durable IndexedDB transactions, permanent checkout UUIDs, idempotent server processing and recoverable synchronization.
- Append-only stock movements, purchasing, lots/expiry, separate transfer dispatch/receipt, held stock and owner-approved stock issues.
- Owner-only [delivery reversals and linked corrections](docs/delivery-reversals.md) for untouched saved inspections, with exact stock/hold/order effects and original-request recovery. Later activity and deliberate partial order closures block automatic reversal.
- Blind physical counts: two separate counter accounts seal observations; an owner who entered neither approves. Disagreement, intervening stock movements, revoked access and self-approval block adjustments. Original evidence remains immutable.
- Cash reconciliation, [selected-quantity cash refunds](docs/partial-refunds.md), full refunds with separate physical-return disposition, paginated records and recovery exports.
- Branch/organization permissions, current-session checks, RPC-only mutations and private privileged functions.

This is pre-pilot software. Actual cashier-PC storage/endurance, Windows reboot recovery, scale/printer operation, verified opening stock and an actual cloud-backup restore still require acceptance. Official tax invoices, full accounting, credit and electronic payments are excluded. Open source does not establish production readiness or guarantee prevention of theft or losses.

## Run locally

Use Node 24 and npm. Docker with a Linux engine is required for the complete local Supabase stack.

```sh
npm ci
npm run db:start
cp .env.example apps/web/.env.local
npx supabase status
```

Set the public URL and local anon/publishable key reported by `supabase status` in `apps/web/.env.local`, then run `npm run dev`. The API uses port 55321, PostgreSQL 55322 and Studio 55323. Never put an administrative or service-role key in a `NEXT_PUBLIC_` setting. Practice mode uses local-only synthetic records.

## Verify

See [VALIDATION.md](VALIDATION.md) for the passing full-stack and annual-capacity runs, measured scope and remaining hardware gates.

```sh
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:db:preflight
npm run test:counts:local
npm run test:counts:restore
```

The supplementary database preflight uses actual PostgreSQL/pgTAP through PGlite with minimal Auth/claims test doubles. The local count harness uses the production component and SQL with simulated identities, on loopback only. Its binary snapshot is not a Supabase/cloud backup. These checks do not replace the real Supabase Auth/PostgREST integration or dump/restore gate.

The Verify AgriStore workflow runs the complete disposable Supabase tests and real database-connected browser scenarios on standard Ubuntu runners. No hosted credentials are needed. The integration and cloud-style dump/restore scripts intentionally require the disposable Linux CI stack and refuse hosted projects. A separate manually runnable capacity workflow tests a five-branch annual fixture. Test timing and synthetic capacity do not certify a particular production environment.

Standard GitHub-hosted runner minutes for public repositories are free under [GitHub's published policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions). These workflows use standard Ubuntu runners and no artifact uploads. Hosting, backups and larger runners have separate conditions and are not purchased or enabled by this repository.

## Contribute and report problems

Use synthetic data in tests and bug reports. Do not post receipts, customer/staff records, passwords, tokens or recovery exports. See [SECURITY.md](SECURITY.md) for vulnerability reporting and [docs/stock-counts.md](docs/stock-counts.md) for the stock-count procedure. Schema changes require migrations, permission/isolation checks, recovery checks and the complete verification workflow before release.

Business logos and photographs from private deployments are deliberately excluded. The included AgriStore SVG mark and its rendered installation icons belong to this source edition. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

See [measured lengths, liquids and pieces](docs/measured-units.md) for rope meters, liter/ml checkout and stock-form entry, real pack conversions, purchasing/transfer/count examples, measured refunds/delivery corrections, damaged/held goods, documented purchase-cost loss examples and sealed items. See [correcting a mistaken refund](docs/refund-corrections.md) for full recovered-cash checks, untouched stock safeguards, preserved originals and linked replacements.

The [October 27 stock-record/concurrency gate](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40524995974) passed 263 unit tests, 67 browser scenarios (22 practice and 45 real Auth/database), 769 pgTAP assertions and a 40-table disposable dump/restore drill. Coverage includes exact meter/ml damage, held outcomes, documented pack-cost previews/corrections, original-ID recovery, no double stock deduction, per-row centavo rounding, worklists beyond fifty and consistent report-page filters. New cases verify stale-catalog held ml entry and cost forms, simultaneous owner disposals and cost conflicts, retained earlier snapshots and history that waits for a completed cost save. See the [older-window and simultaneous-save guide](docs/measured-units.md#work-from-a-window-with-an-older-catalog). Real cashier-PC storage, physical cash/goods rehearsal and production-backup/pilot sign-offs remain separate requirements.
