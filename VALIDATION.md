# Verification evidence

## Purchase orders and delivery inspection

October 27, 2026. Shared application source `7611121` passed both jobs of [40370637294](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40370637294): **193 unit checks, 22 practice-browser scenarios, 23 genuine Supabase/Auth browser scenarios, 400 pgTAP assertions, warning-failing database lint, type checks, application lint, optimized builds and the expanded 35-table dump/restore**. Follow-up source `e744c2d` adds the dedicated supplier foreign-key lookup index.

Final index-inclusive source `e744c2d` passed the same complete gate in both jobs of [40372268912](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40372268912), including all 400 assertions and the genuine 35-table restore.

Two genuine signed-in flows verify owner request/approval, a separate stock employee's fully rejected receipt with zero stock, mixed saleable/held/rejected/missing quantities, physical held return, owner-only supplier-claim resolution, accessible desktop/390/320 px forms and exact loaded-row CSV. A second flow loses a committed full-rejection response, exports the original pending operation, restores the downloaded JSON in a fresh signed-in browser and retries exactly once. It leaves one receipt, no stock movements and the original unreceived order quantity.

The 70 new database assertions cover authorization, session revocation, exact sack/fractional conversions, whole pieces, expired goods, rejected-lot evidence, immutable history, zero/mixed receiving, over-receipt rollback, supplier-document deduplication across both receipt forms, stale order/claim versions, held-goods effects on remaining orders and bounded pages. Supplier progress does not close a claim or change physical stock. Held goods must be physically resolved before order or claim closure; credit/return notes do not post accounting or automatically receive replacements.

The 35-table restore preserves suppliers, receipts, lots and all six private purchasing tables, in addition to existing sale, count, cost, hold and transfer evidence. Original request retries remain idempotent after restoration, and a new replacement inspection successfully receives against the retained order remainder. Private tables deny direct browser access; claims and stock effects remain transactional. All ledger/projection comparisons pass.

See [the operating guide](docs/purchase-orders-and-deliveries.md). This is a quantity/evidence workflow, not supplier messaging or accounts payable. A dedicated linked receiving-correction screen is not included; the guide explains the owner reconciliation procedure and forbids re-entering the same physical delivery as a correction. Real suppliers, staff rehearsal, scales, cashier-PC endurance/restarts, year-scale purchasing latency and actual production-backup restoration remain operational checks.

## Documented purchase-cost stock-loss reports

October 26, 2026. Application/test source `5198d21` passed both jobs of [40326154860](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40326154860): **186 unit checks, 22 practice-browser scenarios, 21 real Auth/database browser scenarios, 330 database assertions, warning-failing database lint, type checks, application lint, optimized builds and the expanded 26-table restore**.

Two new genuine sign-in scenarios cover a quarter-kilo shortage valued at documented cost per 50 kg sack, retained corrections, exact CSV values, unchanged physical stock, manager read scope, accessible desktop/390/320 px forms and original-ID recovery after a committed cost response is deliberately lost. A fresh signed-in browser restores the exported JSON and retries the original request; exactly one cost record and one audit event remain.

The 57 new database assertions additionally cover unit conversions, unknown versus explicitly documented zero costs, immediate session revocation, owner/manager/branch/organization boundaries, source validation, stale corrections, immutable history and bounded pagination. Holds and outstanding transfers are not automatically losses; approved disposal/transfer shortages are counted once. Authorised use is reported separately. Two half-cent rows verify per-row rounding to two total centavos. The restore drill preserves documentary cost evidence, its source, value and original retry across all 26 retained-table fingerprints, with zero ledger/projection differences.

The report uses owner-documented acquisition cost per posted removal and unit-factor snapshots. It does not silently use current retail/catalog prices, implement automatic FIFO/weighted-average accounting, verify source authenticity or establish why goods are missing. A missing cost remains explicitly unvalued. Recorded-time cutoffs are not a locked accounting close across separate requests. This report's latency has not been benchmarked against a year-sized hosted dataset. See [the operating guide](docs/purchase-cost-loss-reports.md). Actual documents, hardware endurance, physical counts, real backup restoration and a reconciled pilot remain operational gates.

## Expiry and assigned-investigation follow-up

October 26, 2026. Application source `8d35022` passed both jobs of [40299113349](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40299113349): **182 unit checks, 22 practice-browser scenarios, 19 real Auth/database browser scenarios, 273 database assertions, warning-failing database lint, type checks, application lint, optimized builds and the expanded 25-table restore**.

The new genuine sign-in flow verifies lot-expiry reminders, configurable windows and filters, independent employee progress, owner-only resolution, unchanged physical quantities and desktop/narrow accessibility. Another flow loses a committed assignment response, exports its saved operation, restores the downloaded JSON under the same owner in a fresh browser with shifts closed and retries its original ID. Exactly one immutable assignment event remains. The restore drill now also preserves assigned deadlines and progress across dump/restore and idempotent replay.

The checks first exposed an unused database variable, ambiguous select labels, a narrow refresh-control overflow and an owner recovery-file checksum mismatch after optional fields disappeared during JSON serialization. Each was corrected without loosening lint, containment, permission or checksum validation. Export hashes the actual JSON written to disk while retaining permanent request IDs and existing fingerprints. The complete linked run passed afterward. Reminders and follow-up notes do not change stock or establish why a shortage occurred. See [the operating guide](docs/expiry-and-investigations.md); real staff/hardware and production backup gates remain open.

## Grams-first checkout follow-up

October 26, 2026. Application source `daa74b2` passed the complete [40265497302](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40265497302): 175 unit checks, 22 practice-browser scenarios, 17 real database-connected browser scenarios, 222 database assertions, database lint, type checks, application lint, optimized builds and the disposable backup/restore drill.

Selecting grams on a blank weight field now changes the entry unit without filling in a provisional quantity or permitting checkout. Cleared weights stay uncharged; nonempty invalid entries retain their text and original unit. The new browser cases cover blank/cleared switching, exact 100/250/500 g conversions and fractional kg, offline sale/reload recovery, and grams-first peso entry at a narrow viewport with mandatory weighed confirmation. Existing stock-control and recovery gates passed unchanged. These synthetic checks do not close the real cashier-PC and operational gates below.

## Earlier stock-control and recovery evidence

October 26, 2026, Asia/Manila. Current evidence applies to application source `6c7305c`; later documentation-only commits do not change that source. This is pre-pilot software, not certification of a production installation.

| Check | Result |
|---|---|
| [Complete verification](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40259205535) | Passed both jobs: 175 unit tests, 20 practice-browser scenarios, 17 real database-connected browser scenarios, 222 pgTAP assertions, warning-failing database lint, type checks, application lint and optimized builds |
| Real authenticated count flow | Separate browser contexts signed in as two counters and an independent approving owner; matched sealed quantities produced one adjustment; original retries retained their effect |
| Recovery drill | Full disposable Supabase dump/restore compared content fingerprints across 25 tables, including private count evidence; resumed ready and first-only counts, retained immutable observations and confirmed exactly-once adjustments |
| Count-request recovery | A server-committed response was lost, exported through the UI, rejected for the wrong employee, restored in a fresh browser as the original employee, retained across reload and retried with the same observation ID. Exactly one audit event remained; no cashier shift was created. Desktop/mobile accessibility and containment checks passed. |
| [Annual-size capacity](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40239599069) | Passed 547,500 bulk-seeded historical sales with two lines each, followed by real transaction-function uploads/replays and racing attempts; final 548,515 sales/payments and 1,096,015 sale movements, with zero stock-projection differences |
| Publication hygiene | Clean independent Git history, generic identity, no business artwork or hosted connection defaults; local Gitleaks snapshot/history scans found no leaks; private vulnerability reporting and public-repository secret scanning/push protection enabled |

The capacity fixture represents five branches at 300 purchases every day for 365 days. It is a synthetic planning scenario, not observed store volume. Historical rows are bulk-seeded; only subsequent purchases exercise the transaction function. The 1,000-upload replay created no duplicates. Twenty simultaneous attempts for ten separate purchases yielded one Created and one Duplicate acknowledgment per purchase.

This run measured 267.7 seconds for fixture loading, 0.90 seconds for snapshot/dashboard, 53.1 seconds for 1,000 sequential uploads, 0.65 seconds for their replay and 1.21 seconds for the racing attempts. Added public table/index allocation was 1,734,656,000 bytes (about 1.62 GiB), roughly 3,162 bytes per retained sale in this two-line fixture. Allocation and timings vary by environment; these exclude transaction logs, backups, network traffic and browser storage/rendering. They are not a hosting quote, large-catalog benchmark or multi-year durability guarantee.

The free public runners exposed and verified fixes for three issues: the restored private table's owner must perform the negative immutability check after `pg_restore --no-owner`; count-mode colors must switch without a low-contrast transition; and Sync-center test selectors must allow the pending-count badge. Table grants were not relaxed and accessibility rules were not disabled. The final linked run passed all checks.

The recovery follow-up first reproduced the missing count/branch operation contracts. The importer now preserves generated request IDs and reference-based approval fingerprints, rejects conflicting actors or requests and supports operation-only recovery without a shift. Sale recovery remains lease-authorized; every eventual command remains server-authorized. A full dependency audit reported no known vulnerabilities at this check; this is not a promise against future advisories.

The generic sign-in adjustment retained the existing interface. Its independent review scored the original SVG's transparent-corner fix resolved at that scope. Local branding checks covered 1440, 1024, 390, 418 and 320 CSS pixels. This visual result does not certify other workflows or hardware.

Still required before real use: selected cashier-PC storage protection, an actual 60-minute outage and eight-hour endurance test, Windows restart recovery, scale/printer checks, verified opening counts, individual staff access, actual cloud-backup restoration and a reconciled one-branch pilot. Automated elapsed-time simulations and disposable restores do not close those gates. The app cannot prove that different humans used different accounts or establish the cause of a stock shortage.

Standard Ubuntu runners provided this verification without a paid-runner or billing change. These workflows do not upload artifacts. See [GitHub's public-repository runner policy](https://docs.github.com/en/billing/concepts/product-billing/github-actions); deployment hosting and production backup capacity remain separate decisions.
