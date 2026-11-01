# Sales analytics reliability review — November 2, 2026

The review follows saved receipts, original item factors and centavo amounts, original payments, later refunds and recovered refund cash through to the owner report, trend, product ranking and complete exports. Magpet remains the only enabled branch. No business-table migration or stock/cash correction is needed for this change.

## Fixed response handling

Previously the screen accepted any successful response with the expected version and branch. Missing nested totals could therefore fail during rendering, while conflicting summary, trend and product amounts could be displayed together. Responses now remain untrusted until all checks pass:

- Requested branch, period, grouping and custom dates match. Preset and comparison dates are independently derived from the server snapshot in Asia/Manila, including Monday boundaries, leap days and month-end clamping; the cashier computer's clock does not choose the report dates.
- Count fields are safe nonnegative integers. Centavos retain exact text/decimal arithmetic, including values beyond JavaScript's exact integer range. Average purchase and gross-minus-refunds-plus-recoveries must reconcile.
- Trend rows partition every selected calendar bucket once, without gaps or overlap, and sum to the summary's counts and all four monetary amounts.
- Product IDs are unique, quantities are positive in their own supported base units, pieces are whole, receipt frequencies are possible, and original product gross totals sum to receipt gross sales. Unlike quantities are never added together.

A rejected response stays inside the existing error/retry flow. It cannot replace the last valid report or change its export scope. No sale, payment, stock movement, offline contract or local database version changes. The existing layout and branding are retained.

These checks detect inconsistent API responses. An internally consistent but incorrectly entered sale still needs business reconciliation; the app cannot infer missing physical goods or unrecorded cash from arithmetic alone.

## Automated coverage

The new independent database oracle uses 2,801 retained synthetic receipts, quantities in kg/liter/meter/piece, zero-price measured goods, amounts beyond JavaScript's exact integer range, late receipt uploads, full reversals and recovered cash on later dates. Across **36 custom/preset and daily/weekly/monthly combinations**, **288 assertions** independently reconcile current and previous sums/counts/averages, refund/recovery posting dates, each individual trend bucket, the complete trend partition, original unit quantities, per-product receipt frequency and prior frequency. Fixtures roll back and never target the hosted business.

New unit checks reject incomplete/null snapshots, wrong scope, missing/duplicate buckets and products, inconsistent exact values, impossible frequencies, fractional pieces, invalid quantities/timestamps, overlapping comparisons and unsafe counts. Calendar cases include Manila midnight, Sunday/Monday, 28/29/30/31-day months and year transitions. Existing money, CSV and ranking checks remain.

A supplementary local Node check validated a coherent 20,000-product snapshot in 35 ms. This measures the new linear response checks on the development machine only, excluding rendering, network/database time and cashier-PC certification. The prior database-capacity evidence remains in [the original verification record](sales-analytics-verification.md); SQL reporting queries are unchanged in this follow-up.

The genuine browser scenario injects successful-but-inconsistent totals and chart rows, missing nested fields and null responses. It checks that the last valid figures and complete 23-product CSV survive, then restores a real valid response and verifies recovery. The existing browser flow now also applies a full leap-year custom date range. These tests run automatically in the existing public-source verification workflow on code changes, alongside the supported cashier/inventory/refund/restore workflows.

## Hosted read-only findings

The selected staging project was checked with the existing active owner session scope inside a rolled-back transaction. **21 report/grouping combinations and 42 current/comparison windows** reconciled independently, including **12 nonempty windows**. Historical entries are test records, not evidence of actual Magpet sales.

Separate read-only checks found **zero** receipt/item-total differences, original-sale-payment differences, partial-refund-payment differences, recovered-refund-payment differences, inventory-ledger/projection differences or direct authenticated INSERT/UPDATE/DELETE grants on business tables.

Security advisors retain the existing [command-only RLS information notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [disabled leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Performance advisors list [unindexed foreign-key information notices](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys) and [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). Informational findings are not a reason to grant direct access, remove safety indexes or add indexes indiscriminately. This response-validation change adds no function, grant, table or index.

The production dependency audit reports **zero advisories**. The existing build/development dependency audit still reports 24 (two low, twenty-two moderate); dependencies and lockfiles were not force-upgraded as part of this report fix. Archived command implementations deny execution to both anonymous and authenticated callers; the current command and analytics entry points retain their session/role checks.

Actual cashier hardware/storage endurance, physical opening counts, staff rehearsal and actual production backup restoration remain separate pilot gates.

## Final verification and release

[Verification run 41335942008](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/41335942008), reviewed public source `6a43781202590db7d66e9a82b779dddedd206d62`, passed **438 unit tests, 1,167 genuine PostgreSQL/pgTAP assertions in 21 files, strict database lint, type checks, zero-warning lint, production builds, the encrypted 40-table functional restore, 25 practice-browser cases, 59 general genuine Supabase/Auth cases and 35 fixed-Magpet runs**. The combined **119 browser executions** include repeated supported scenarios under the branch lock; they are not 119 distinct scenarios. All four analytics scenarios passed in both authenticated configurations, including malformed-response recovery and complete exports. The 300-sale Magpet offline/lost-response/recovery rehearsal again produced 300 unique original receipts, 262,500 centavos of sales, 75 kg sold, 925 kg remaining and 272,500 centavos in the closed drawer including opening cash, with no recovery duplicates. It explicitly does not certify actual physical endurance.

The unchanged interface was visually checked in the new genuine-test screenshots at 1440, 390 and 320 px; responsive containment and automated accessibility checks passed. Synthetic captures use public generic branding and TEST products; they do not represent real business stock or a signed-in inspection of the private hosted website. The design detector returned no findings. The precise inherited layout was retained; this was response handling, not a redesign.

Private application source `4ee6626f9f52d2ba4e031b30c966374f06a93cf9` matches all five implementation/test files in the passing public source. It built on verified `team-payaman2/agristore-pos` with Node 24 as READY Preview **`dpl_CJWPwZiTFf7N8ai1tYrsYiKUQ9mD`**, `agristore-qf73421xi-team-payaman2.vercel.app`. After the full gate passed, the [stable staging address](https://agristore-pos-staging-team-payaman2.vercel.app/) was assigned and independently inspected to that exact preview. Its fresh health response at **2026-11-01 18:32:43 UTC** (**November 2, 02:32:43 Asia/Manila**) reported the same release and `status: ok`.

All **40 hosted business-table counts and full content fingerprints remained identical** before and after the audits and staging release. No hosted synthetic records, employee accounts, stock/cash changes or pilot approvals were created. No production promotion, paid setting, dependency/lockfile change, database migration or browser-storage upgrade was needed. After synchronizing pending work, users can apply **Settings → Check for app update**, then reopen without clearing site data.
