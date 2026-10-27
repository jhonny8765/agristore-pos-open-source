# Give a partial cash refund safely

Use **Sales & receipts → Partial refund** beside the original confirmed receipt. Only an owner can authorize it online, using the owner's own open cashier shift in the **same branch**. Earlier full refunds remain historical; they cannot receive another partial refund.

This flow refunds selected original quantities. It does not issue arbitrary cash discounts, change the original receipt, exchange products automatically or issue an official tax invoice.

## 1. Prepare the receipt, drawer and goods

1. Choose the original sale's branch. Find its receipt, loading older receipts if necessary.
2. Confirm the receipt and the customer's requested refund with the owner.
3. Synchronize pending sales and resolve saved requests in Sync center. Finish or clear the current basket.
4. Use the owner's own open shift. If a cashier currently owns that PC's shift, reconcile and close it properly before the owner signs in and opens the owner's shift. Do not use another employee's account.
5. Check the actual money in the drawer and the recorded opening float. Refunds cannot exceed recorded drawer cash. A later shift does not automatically contain the cash from an older closed shift.
6. Inspect and weigh returned goods. Keep damaged, expired or uncertain goods separate.

Viewing **Partial refund → Check remaining quantities** works online even with the owner's shift closed. Issuing a new refund stays disabled until the shift, basket and pending-record conditions are satisfied.

## 2. Choose only the quantities to refund

1. Press **Partial refund** beside the receipt. A **Refund selected quantities** section opens below the receipt list.
2. Check the receipt identifier, then press **Check remaining quantities**.
3. Read **Original paid**, **Already refunded**, **Cash remaining** and each line's sold/refunded/remaining quantities.
4. Enter **Refund quantity** only on the selected lines. Leave other lines blank or zero.
5. For each selected line, enter **Physical returned quantity**. This may be less than the financial refund quantity, but cannot be greater. Enter zero when no goods came back.
6. Choose the physical disposition below. For a split return, enter its saleable portion.
7. Enter a **Partial refund reference** identifying the signed return/refund record.

Every saved quantity uses the **original sale unit**. Meter/liter products now have explicit entry-unit selectors, including **ml** for liquids. Choose the entry unit first, then check its recorded original-unit and stock equivalent. Each line shows the original conversion. For a sale in kilos, one quarter kilo is `0.25`; half a kilo is `0.5`. For a sale in 50 kg sacks, 10 kg is `0.2` sack and 250 g is `0.005` sack. Do not type kilograms into a sack field. Packet/piece stock must remain whole pieces. Quantities support up to six decimal places and exact base-stock conversion.

| Actual returned goods | Choose | Stock effect |
|---|---|---|
| Nothing returned | No goods returned, physical quantity 0 | No stock added |
| Goods inspected and fit to sell | Inspected and saleable | Add only those goods to saleable stock |
| Damaged, expired or not yet inspected | Hold separately for inspection | Keep separate; no saleable addition |
| Some saleable and some held | Split between saleable and held goods | Add only the inspected portion; hold the rest |

Expired lots cannot return to saleable stock. The app preserves the original product, lot and recorded conversion. A cash refund itself is not proof that goods came back.

## 3. Review the exact money and stock effects

1. Press **Review partial refund**.
2. Read **Cash to refund now** and the amount for every selected line.
3. Check each line's physical return, saleable addition and held quantity in the product's base unit.
4. If a field is wrong, edit it and review again. Editing the quantities/reference cancels the previous review.

Amounts come from the original paid line totals, including the original rounding. Current catalog prices and the amount originally tendered do not replace the paid amount. For example, a customer who paid ₱880 from a ₱1,000 note received ₱120 change; at most ₱880 can be refunded.

Several small refunds use cumulative centavo rounding. A line originally paid at ₱1.00 split into three equal portions refunds ₱0.33, ₱0.34 and ₱0.33. The final portion receives exactly the remaining centavos. Very small portions can show ₱0.00; their quantities still become financially refunded, and the final allocation retains the original centavo. Always read the amount shown.

## 4. Authorize, save and hand over cash once

1. Press **Authorize partial refund**.
2. Check the confirmation that you verified the cash and physical quantities.
3. Enter the **Partial refund reason**.
4. Press **Confirm partial refund** once.
5. Wait for the saved confirmation. Give only that confirmed cash amount **once**, retaining the signed refund reference and evidence of handover.
6. Check the refreshed remaining cash and quantities and **Saved partial refunds** history.

The server rechecks access, the open owner shift, drawer cash, original quantities, earlier refunds and expiry. If another refund was saved after the screen was checked, confirmation is blocked; use **Refresh refund details** and review the remaining quantities again. A successful save records the cash payment, selected line allocations, saleable movements, holds and audit evidence together, or none of them.

After a partial refund, **Full refund** is removed for that receipt and the server also blocks it. Use the selected-quantity flow for any remainder. When every original quantity has been refunded, the details show that no further cash refund is allowed. Original sales and earlier refund records are not edited or deleted.

## Example: some feeds and one seed packet

The original sale was 0.5 of a 50 kg sack for ₱750 and two packets at ₱65 each: **₱880 paid**.

Refund 0.2 sack plus one packet: **₱365 cash**. Physically, only 0.1 sack came back; inspection found 0.04 sack saleable and 0.06 sack damaged. The packet is saleable.

| Result | Exact effect |
|---|---:|
| Cash refunded | ₱365 |
| Saleable feeds added | 2 kg |
| Feeds held separately | 3 kg |
| Saleable packets added | 1 packet |
| Remaining refundable feeds | 0.3 sack |
| Remaining refundable packets | 1 packet |
| Remaining refundable cash | ₱515 |

With a ₱100 opening float and no other cash movements, the drawer should contain **₱615** after this refund. Refunding the remaining ₱515 with no further goods returned leaves **₱100 cash** and does not add stock. Damaged held goods still require their own owner disposition in Inventory.

## Interrupted saves, history and daily checks

If a confirmation is interrupted, **do not pay again or enter a new refund**. Go to **Sync center → Retry original request** as the same owner. Export a recovery file if needed and restore it under that same account/branch. The permanent refund ID, original selected quantities, amount and checked version remain retained. A committed request retries exactly once even after its shift closes; a new refund still requires an open owner shift. Changed contents under the same ID are rejected. Revoked/expired access requires renewed authorization and does not discard pending evidence.

A saved action followed by a failed refresh is already completed; reconnect and refresh its history. Never clear browser storage to remove an uncertain request. The app cannot know whether cash was physically handed over, so check the signed handover evidence before paying after recovery.

Saved history starts with 30 partial refunds per receipt. **Load older partial refunds** reaches older records. Receipt-list indicators are bounded; open the details for exact totals. Original receipt history and all refund/line evidence stay retained.

Reconcile the actual drawer at shift closure: opening float plus recorded net sale payments minus full and partial cash refunds. Saleable returns are in the stock ledger; held/no-return quantities are not automatically available stock or financial losses. Investigate a held or missing return through its retained stock case.

A new refund cannot be used later just to add goods from an already refunded quantity. If goods arrive after their cash refund, preserve that refund reference and use the owner's physical reconciliation procedure; do not issue cash twice or invent another sale. Exchanges, discretionary price-only credits, reversing a mistakenly issued refund and automated tax/accounting treatment remain separate workflows.

Before real use, rehearse with actual staff and a checked scale/drawer. Software checks do not certify cash handover, physical truth, cashier-PC endurance or the real backup/pilot gates.

For rope, ml, mixed measured returns and corrected replacements, follow the [measured refund examples](measured-units.md#refunds-and-corrected-deliveries-in-meters-or-ml). Full-refund physical entry supports the same switches but still refunds the entire original cash amount.
