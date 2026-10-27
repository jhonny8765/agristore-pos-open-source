# Closed-shift offline branch recovery

October 28, 2026. A closed-shift offline restart previously restored cached membership and branch options without restoring the selected branch ID. A native selector could visually show its first option while the receipt query had no branch scope and displayed an incorrect empty result. Saved transactions were retained.

The stock snapshot now carries local organization/branch metadata. Snapshot application saves that metadata atomically with stock, catalog and acknowledgments. Restart selects the downloaded branch only when it matches the cached membership's organization, permitted branch and cached branch list. A saved cashier authorization still takes priority. Account-cache clearing removes the metadata without deleting saved sales or unresolved requests. This grants no extra permissions or offline shift opening.

A legacy cache without scope asks for reconnection; the selector, Sync center and readiness checks do not claim the queue is empty. An owner also retains a valid downloaded second branch across an online reload rather than resetting to the first branch.

The complete [verification run 40580476173](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40580476173), source `f115b8bcfd99e7564c216b8cf475db0e48e1cb3b`, passed:

- 322 unit tests in 25 files; type checks, strict lint and production builds.
- 22 practice-browser scenarios and 51 genuine Supabase/Auth browser scenarios.
- 811 pgTAP assertions in 17 files; strict database lint.
- A real disposable 40-table dump/restore, preserving original retries and exact cash/stock evidence.

The added browser scenario passed in 2.4 seconds. It synchronizes one sale, closes its drawer at exactly 100 centavos, reopens offline with no shift, retains the original receipt, verifies a second branch across online/offline reloads, removes only scope metadata in its disposable legacy-cache simulation, and checks explicit recovery warnings. Final evidence remains one original sale/payment, 99 kg stock and a closed drawer with expected/count cash of 100 centavos.

The first run timed out before its first offline navigation because the test incorrectly waited for an initial worker to claim an already-open window. The corrected test waits for installation and reopens online before disconnecting. `clientsClaim: false` and guarded updates remain intact; no money, stock, identity or isolation assertion was removed.

This does not certify a specific cashier PC, persistent browser storage, physical outage duration, Windows restart, measuring devices, real opening stock/staff, production backups or a real-store pilot. Complete those separately before launch.
