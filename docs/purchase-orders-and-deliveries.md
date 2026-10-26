# Purchase orders and delivery checks

Use **Purchasing** while connected. Keep the supplier's documents and signed inspection notes with the store records. These workflows record quantities and evidence; they do not send an order to a supplier, make a payment, issue a supplier credit or provide full accounting.

## 1. Add the supplier

An owner or manager opens **Purchasing → Suppliers**, enters the supplier name/contact and presses **Add supplier**. If the new purchasing area says no suppliers exist, use **Open Suppliers below**. Stock staff ask an owner/manager to add the supplier.

Check the branch in the top bar. Branch switching needs a connection and a closed cashier shift. Orders and deliveries belong to that branch; the receiving employee must have access to it.

## 2. Request the goods

1. Open **Request a purchase order**.
2. Choose **Order supplier**.
3. Enter a unique **Purchase order reference**, an optional expected delivery date and the reason for the order.
4. For each line, choose **Ordered product / unit** and enter **Ordered quantity**. Enter sacks when Sack is selected, kilos when Kilo is selected. A 50 kg sack must have the correct product conversion already configured.
5. Use **Add order line** or **Remove order line** as needed, up to 50 lines.
6. Press **Save order request**.

Owners, managers and stock staff may request goods. A request adds no stock. It appears as **Awaiting owner approval**. The owner verifies branch, supplier, units and quantities, then uses **Approve purchase order**, records the evidence and presses **Approve order**. Only an owner can approve, cancel a pending request or close an approved order. The app records that decision; staff separately communicate the actual order to the supplier.

## 3. Inspect what physically arrived

Stock staff select an approved open order in **Inspect supplier delivery**. Owners/managers may also choose **Unplanned delivery** and select its supplier. The quick saleable-receipt form remains available to owners/managers; stock staff use an approved order. Never record the same goods in both forms.

Enter the supplier document reference and inspection explanation. Use the actual delivery-note/invoice identifier. If one invoice arrives in several separately inspected drops, retain its invoice number and add the distinct delivery-note or numbered-drop reference; each saved inspection needs its own reference. A supplier/document reference at the same branch cannot be entered again through either the quick-receipt or inspection form when that supplier is identified. Older quick receipts without a supplier cannot be reliably matched this way; check Receiving history before saving.

For every delivered line, enter all four quantities in the **selected delivery unit**:

| Field | Enter |
|---|---|
| Supplier document quantity | What the supplier document says for this inspection |
| Accepted saleable quantity | Goods inspected and ready to sell |
| Held quantity | Goods physically taken into store custody but segregated and unavailable for sale |
| Rejected quantity | Goods refused and kept by/handed back to the supplier at inspection; never taken into store stock |

**Accepted + held + rejected = goods physically inspected.** The difference from the supplier document stays visible. Do not call goods still in store custody rejected just to remove them from stock control; use Held and keep them physically segregated.

Enter `0` explicitly when none. Blank/nonfinite/negative quantities are rejected. Quantities support six decimals after conversion; pieces must remain whole. Explain every hold, rejection or difference from the document. Retain lot and expiry details, including rejected-goods evidence. Goods entering expiry-tracked stock require their lot and expiry; expired goods can be held or rejected but cannot be accepted for sale. An existing lot's expiry cannot silently change.

Remove order lines that did not arrive in this particular delivery. Add a line when separate lots require separate inspection entries. Ordered receipts must match the approved line's product and unit. Accepted plus held goods cannot exceed the unreceived order quantity; use an additional approved order for genuinely authorized extra goods.

Review everything, then press **Save delivery inspection**. This is a final, immutable inspection record.

## 4. Understand the stock result

Example: ten 50 kg sacks are ordered. The document says ten, but the inspector finds six saleable sacks, one held sack and two rejected sacks. One documented sack did not arrive.

- Enter document `10`, accepted `6`, held `1`, rejected `2`.
- Only **300 kg** becomes saleable.
- **50 kg** is held separately.
- The rejected 100 kg and missing 50 kg never increase store inventory.
- Three sacks (**150 kg**) remain unreceived against the order. Held goods reserve order quantity while they remain in custody.

For a **fully rejected delivery**, enter accepted `0`, held `0` and the physical rejected quantity. The inspection, supplier reference and open claim are saved, with **zero inventory movements**. A document for ten sacks with no actual delivery can use document `10` and all physical quantities `0`, with an explanation; it also adds no stock.

Purchasing does not automatically classify supplier shortages/rejections as store stock losses. The purchase-cost loss report continues to value posted store shortages/disposals using its separate documented evidence.

## 5. Handle held goods and replacements

The owner opens **Inventory → Held goods**, inspects the goods and records release, disposal or supplier return in **base units**, such as kilograms. Releasing 25 kg from a held 50 kg sack adds exactly 25 kg to saleable stock. Returning or disposing held goods never deducts saleable stock again.

Released held goods count as accepted order goods. Returned/disposed held goods reopen the corresponding unreceived order quantity. Record replacement goods as a **new inspection** against the same open order, using its distinct delivery reference. A supplier credit, replacement promise or claim note alone never adds goods or fulfils an order.

The owner explicitly closes an order when its deliveries and remaining commitment are settled. A partly unfilled order can close with a retained explanation; the unreceived quantity remains visible. Held goods must be resolved first. Closing prevents further receiving and does not erase supplier investigations or shortages.

## 6. Follow up supplier claims

**Inspected deliveries and supplier claims** shows every line's document, accepted, originally held, rejected and current held quantities. Open claims also appear in Inventory's investigation worklist, where owners/managers can assign a responsible employee and due date. Assigned progress does not close the claim. Supplier-claim resolution belongs in Purchasing.

1. Find the delivery and choose **Record supplier-claim evidence**.
2. Enter the supplier claim/credit/return reference and evidence.
3. Choose **Progress · keep open** while documents or action are outstanding.
4. Only an owner may choose a resolution: confirmed credit, returned goods, verified replacement or no supplier claim with an explanation. Resolve held goods physically in Inventory first.
5. Save the evidence. **View supplier-claim history** retains the earlier progress and outcome versions. A stale open form cannot overwrite a newer recorded version.

A resolution is an owner's documented conclusion. The app does not independently verify that a supplier issued a credit or that a reference is authentic. Keep the signed source record. This workflow does not settle accounts payable or automatically record replacement stock.

## 7. Recover an interrupted save

If a confirmation is interrupted, open **Sync center** and **Retry original request** under the same employee account. The original order, approval, delivery or claim ID is retained. A completed server transaction returns its original result without adding a second receipt, hold or movement.

Export a recovery file if necessary, then restore it in a fresh signed-in browser as the same employee and branch before retrying. Do not clear browser storage or enter the completed delivery again as a new inspection. Revoked access or expired authentication stops processing until authorization is restored; it does not discard the saved request.

## 8. Read older records and correct mistakes safely

The new order and inspected-delivery registers load 30 headers at a time, with up to 50 lines each. Use **Load older purchase orders** to reach an older approved order, and **Load older delivery inspections** for earlier claims. Claim history loads 50 events per page. **Export loaded inspections (CSV)** includes only loaded inspection lines, their branch/snapshot/source references and exact quantities. Keep exports private. Old quick receipts and opening imports remain in **Receiving history**.

Orders and final inspections cannot be edited or deleted. Cancel a mistaken pending order; close an approved order with its explanation and request corrected future quantities. For a wrongly saved delivery, stop and preserve its original ID/document. The owner must reconcile physical stock and held goods using the approved count/disposition controls and document the error and remaining order commitment. **Do not enter the same physical delivery a second time to correct it.** A dedicated linked inspection-reversal workflow is not included in this release.

Before real use, rehearse a good delivery, a mixed delivery, a full rejection and a replacement with actual staff and a checked scale. Verify opening quantities, per-product conversions and supplier records. Software tests do not replace signed business records, selected-PC endurance/restart checks or a real production-backup restore.
