# Verification evidence

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
