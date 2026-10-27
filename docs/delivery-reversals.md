# Reverse a mistaken saved delivery safely

Use **Purchasing → Inspected deliveries and supplier claims**. This is an online, owner-only correction for a **full, untouched delivery inspection**. It keeps the original receipt and adds a linked opposite stock entry; it never edits or deletes the original evidence.

This corrects a data-entry mistake. If goods really arrived and were later sold, transferred, lost, returned or disposed, use the corresponding store workflow and owner reconciliation. Do not reverse a valid receipt to hide missing stock or a real supplier return.

## 1. Stop and check the branch

1. Confirm the branch and original supplier document. Read the product, lot, unit and all four inspection quantities.
2. Check the actual goods and original inspection sheet. Do not rely only on the screen.
3. Synchronize **every cashier PC for that branch**, including any recovered or retired-PC records that still need attention. Resolve pending sales and saved online requests in Sync center.
4. Close every branch cashier shift online. Clear your current basket. Do not reopen checkout until the correction is complete.

The app blocks a reversal while a branch shift is open or this PC has a basket, local cashier shift, unresolved sales or saved online operations. The owner must also confirm the other branch PCs are synchronized: the server cannot see an offline record that has never been uploaded.

## 2. Check whether an automatic reversal is safe

1. Find the inspection, loading older pages if necessary.
2. Press **Check delivery reversal**.
3. Read the planned saleable removal, held cancellation and before/after book quantities for each product/lot. Different base units are kept separate.

The server refuses automatic reversal if:

- The inspection was already reversed.
- An affected product/lot has a later sale, refund, transfer, receipt, adjustment, loss or hold movement, even if its current quantity seems sufficient.
- Those goods have a later approved physical count, including a count with no discrepancy.
- Any of its held goods have already been released, returned or disposed.
- Supplier-claim notes, resolution, assignment or investigation progress already exist.
- The owner closed the linked order with an unreceived remainder; reopening it would revive previously cancelled quantities.
- Original movements no longer match the saved inspection, the linked order has an unexpected state or there is insufficient saleable book stock.

**Automatic reversal is blocked** means stop and reconcile the source with the owner. There is no force button. Do not add another receipt or negative quantity to make the book appear correct. A problem on one line blocks the **whole** multi-line reversal; eligible lines do not partly reverse.

These buttons apply to inspections saved through **Inspect supplier delivery**. Older **Quick receipt** records and opening-stock imports remain under the existing owner reconciliation/count controls; this release does not automatically reverse them.

## 3. Confirm the full reversal

If the check allows it:

1. Press **Reverse mistaken delivery**.
2. Enter a **Delivery correction reference**, such as the signed correction-sheet reference.
3. Check both confirmations: actual goods verified, and all branch cashier PCs synchronized with shifts closed and no unresolved sales.
4. Enter **Delivery reversal evidence** explaining the mistake and what was checked, with at least ten characters.
5. Press **Confirm full delivery reversal**.

The server checks the history again. If branch stock or the linked order decision changed after the preview, press **Recheck delivery reversal** and review the new result. The old preview cannot authorize a newer stock state.

The reversal atomically removes the original saleable addition, cancels untouched held goods and removes that inspection's contribution from the purchase-order totals. Every opposite movement links its original movement. These correction movements are not financial stock losses. Other receipts, sales, cash, prices and unrelated lots are not rewritten.

If the order was fully received before it was closed and the reversal removes received goods, the app appends an owner decision reopening that order. Only the removed order quantity becomes unreceived again; other deliveries remain counted. Reversing a fully rejected, zero-stock inspection produces no stock movements and keeps an explicit order closure intact.

An untouched discrepancy created only by the mistaken inspection closes with an **administrative reversal** explanation. It does not become a supplier credit. Existing supplier/investigation activity instead blocks the automatic reversal so its evidence can be reconciled deliberately.

## 4. Save the corrected inspection, if needed

Reversal alone leaves the mistaken entry cancelled. If actual goods still need to be recorded correctly:

1. Press **Prepare corrected delivery** on the reversed row.
2. The app opens a linked correction in **Inspect supplier delivery** and focuses its document reference. The banner identifies the original reversed inspection.
3. Verify supplier, approved order, units, lots and expiry. The original order must be loaded and open when preparing its correction. Change the order/supplier only when the real source supports that correction.
4. Replace every incorrect document, accepted, held or rejected quantity with the actual verified quantities. Fill in the new explanation and any difference evidence.
5. Keep a distinct supplier/correction reference; the proposed reference retains the original prefix and a correction identifier. Do not reuse a recorded supplier document as an unlinked receipt.
6. Press **Save delivery inspection**.

The new row identifies the reversed source, and the old row identifies its corrected delivery. Only one direct correction may link each reversed inspection. If that corrected inspection is also mistaken, it must itself pass a fresh reversal check; any further correction links it as the next step. The original history is never replaced. Automatic correction linkage is within the same branch; wrong-branch records require an owner to coordinate the old and correct branch's records explicitly.

Use **Cancel linked correction** to abandon an unsaved draft. This does not undo the already completed reversal. Never enter the original goods a second time simply because a confirmation or refresh was slow.

## Example: correct half a sack to a quarter sack

Assume no earlier stock and a ten-sack order, with each sack equal to 50 kg.

| Step | Saleable | Held | Order unreceived |
|---|---:|---:|---:|
| Mistaken inspection: 0.5 sack accepted and 0.5 held | 25 kg | 25 kg | 450 kg |
| Full reversal of that untouched inspection | 0 kg | 0 kg | 500 kg |
| Corrected inspection: 0.25 sack accepted and 0.25 held | 12.5 kg | 12.5 kg | 475 kg |

The corrected inspection's supplier document quantity is 0.5 sack. If other stock existed beforehand, it remains in the book; the example starts at zero only to make the calculation easy to check.

## Interrupted saves and reports

If a response is interrupted, go to **Sync center → Retry original request** as the same owner. Recovery-file export/import retains the original reversal ID, checked stock revision and order version. A confirmed reversal retries without another deduction, even if later activity exists. Changed contents under the same ID are rejected; a second ID cannot reverse the same inspection again. Revoked access stops processing and leaves the request recoverable.

An already reversed row may appear before the interrupted request has been acknowledged on this PC. Resolve its saved request in Sync center before doing anything else; do not submit a second reversal. A successful save followed by a failed refresh also does not require resubmitting it.

Order totals count only effective inspections. Stock reconciliation includes signed purchase and hold corrections, and historical held balances include their cancellation events. **Export loaded inspections (CSV)** retains original quantities plus `record_state`, reversal details and correction IDs. Reversed rows are historical evidence: do not sum their original accepted/held quantities as active stock. The CSV still contains only loaded rows.

Before real use, rehearse an untouched reversal, a blocked later-sale case and a linked correction with actual staff. These controls rely on truthful physical verification and accounted-for cashier PCs; software tests do not certify physical stock or replace the branch pilot and real backup/PC-restart checks.

For meter/ml corrections, prefilled quantities start in the original delivery unit. Change each entry-unit selector before editing and check every recorded equivalent. See the [measured delivery example](measured-units.md#refunds-and-corrected-deliveries-in-meters-or-ml). Delivery reversal/correction does not create cash payments.
