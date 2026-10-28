# Recoverable shift closing — October 28, 2026

Closing previously relied on the displayed local-sale list and a direct server call. An unfinished basket or ambiguous refund/stock request could be overlooked; an interrupted closing response had no durable recovery entry.

## Changed behavior

- Finish or remove the unfinished basket before closing. The basket is not silently cleared by a successful closing.
- Before retaining a closing request, atomically check every unresolved sale and stock/refund request in the branch, including older records and another local employee's request. A request for a different branch does not affect this drawer.
- Retain the original shift ID and counted centavos before contacting the server. An uncertain response keeps that request in Sync center and recovery files. Changing the entered counted cash cannot replace it.
- While closing is uncertain, the same browser database blocks new sale saves and new branch operations. Online opening/renewal also directs the employee to confirm the original closing. The cashier must use one dedicated window; this local fence does not coordinate a different PC/browser profile.
- Retry through Sync center as the original employee. The existing server command returns the original closed shift without another cash adjustment or closing audit event. Confirmation removes only the matching saved lease; a late response cannot erase a newer shift.
- An authoritative database rollback removes the failed request but retains the still-open lease. Authentication/network/native-timeout uncertainty retains the original request.
- Operation-only recovery can restore the closing request without opening another shift. No lease or sale history is deleted by recovery.

No database migration, cash formula, stock valuation, IndexedDB version or sale/recovery file version changed. Version-2 recovery files can now contain the `close_shift` operation. Older website releases that do not recognize it must not be used to restore those files; preserve the current application and use a forward fix.

## Verification

Local checks: type checking, lint, all **374 unit tests** and the production build passed. The twelve new tests cover old unconfirmed sales in every unresolved state, pending refunds, permanent shift/count recovery, changed cash rejection, sale/change blocking, rollback, late responses, expired authorization and concurrent refund/close attempts.

The final [CI run 40608582344](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40608582344) passed on public source `f1a2949abd52cb9bd5222864011a9830937b14d2`: 374 unit tests, 25 practice browser cases, 54 genuine Supabase/Auth browser cases, 819 pgTAP checks, strict database lint and the authenticated encrypted full-dump restore with all 40 retained table fingerprints and functional checks. Both added real-database closing cases passed: unfinished/uncertain work prevented closure, and a committed close with a lost response survived reload and operation-only recovery replay with exactly one closing audit entry, one original payment, correct counted/expected cash and unchanged stock beyond the original sale.

The first public-source run failed branding/accessibility selectors after a whole-file copy included private merchant branding. The public edition's generic branding was restored; the complete final run above passed. Shared business/recovery/test files match the private source after newline normalization, and the private UI's functional diff was applied to the generic public UI without branding changes.

Local visual review at 1440 and 390 px confirmed readable closing instructions and no mobile horizontal overflow. Captures are retained under `.impeccable/review/shift-closing/`. A pre-existing `/favicon.ico` 404 appeared in the isolated manual browser; the manifest/app icons load separately. No claim of zero browser-console errors is made.

## Staging release and remaining gates

Private source `d54d25c5e841621c9efbec6166194f8cc52f6b44` built as READY Preview deployment `dpl_8AQXWZnJ1zSdqNZkH5rYGW758uDT`, `agristore-a2kikb7lp-team-payaman2.vercel.app`. After the complete gate passed, the existing stable staging alias was assigned to that preview and independently read back against project `prj_TgKyMFhFXmcWBE200W3cOk6eeA8R`. Its uncached authenticated health response reported `status: ok` and that exact release. The prior compatible preview `dpl_ySrYbPEwKFBAgWoALENG6jaunLHp` remains available; do not restore newer closing recovery files using an older client that lacks their operation support.

Read-only hosted checks before/after release matched: 404 sales, 408 payments, 427 inventory movements, net recorded cash 385000 centavos, zero open shifts, healthy database probe. This turn made no hosted business-data writes or migrations. Vercel's connected app lacked this team's access; the existing authorized local CLI independently verified the intended project and deployed only to Preview/staging. No protection, paid setting or production service was changed.

For an already-open installed app, finish the basket, confirm all original pending requests/sales, then use Settings → Check for app update and follow the reopen message. Preserve the same browser profile and site data.

The physical cashier/endurance/equipment test, actual business opening counts/costs, individual staff rehearsal, production environment/backups/actual production restoration and owner-approved one-branch pilot remain unpassed. See [the short store launch checklist](store-launch-actions.md). Full website/missed-monitor/missed-backup alerting remains separate from the verified database-only email monitor.
