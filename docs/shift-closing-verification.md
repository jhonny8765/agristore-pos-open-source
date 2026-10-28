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

Full browser/Supabase/restore results and release status are recorded after the exact candidate completes CI. This document does not certify the physical cashier PC, production backup or live-store pilot.
