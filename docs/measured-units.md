# Sell by weight, length, volume or pieces

Choose the stock measurement when adding the product in **Inventory**. Set the real conversion and price before receiving or selling it. One product uses one base measurement so every receipt, sale, refund, transfer and count shares the same stock quantity.

| Store item | Selling setup | Stock measurement | Example |
| --- | --- | --- | --- |
| Loose feeds or fertilizer | Loose kilos, or a sack with a separate kilo price | kg | 250 g = 0.25 kg |
| Cut rope | Rope / measured meters | meter | ¼ meter = 0.25 meter |
| A rope roll with cut-length sales | Other pack size, stock measured in meters, actual roll length; enable cut meters with a separate price | meter | A documented 100 m roll = 100 meters; do not assume every roll has this length |
| Measured liquid | Measured liters / milliliters | liter | 250 ml = 0.25 liter |
| Liquid in a container that can be opened | Other pack size, stock measured in liters; enter the actual volume; optionally add a separate liter price | liter | A 500 ml container = 0.5 liter |
| Sealed bottle, packet, tool or other individual item | Sealed items / pieces | piece | One unopened 500 ml bottle can be one piece when it is always sold sealed |

## Add the product

1. Open **Inventory**. Enter the product name and SKU.
2. Choose **How customers buy this product**.
3. Enter the selling unit name, real pack conversion when applicable, selling price and purchase cost. Prices are in pesos. Do not confuse a container price with a price per liter or a roll price with a price per meter.
4. If you also sell from an opened pack, enable the separate retail unit and enter its own price and cost. The app does not infer retail prices by dividing a pack price.
5. Set the low-stock threshold in the displayed stock measurement. Enable lots and expiration when needed.
6. Add the product, then receive actual counted goods in **Purchasing**. Check the conversion summary before saving.

Use **pieces** for bottles that must remain sealed. A bottle's printed volume alone does not mean the cashier should sell a fraction of it. Kilograms and liters are different measurements; the app does not convert between them or calculate product dilution.

## At checkout

- **Weight:** choose the configured kilo unit. Enter `0.5`, `1/4` or use the quarter/half shortcuts. Switch to grams to enter a scale reading such as `250`. Peso entry remains available for loose kg products and requires confirming actual scale weight.
- **Rope:** choose Meter and type the actual cut length, such as `0.5`, `1/4` or `1.25`. A roll uses its configured roll conversion. Fractions affect both the price and meter stock exactly.
- **Liquids:** choose the configured selling unit that equals **one liter**. Use **Volume entry** to switch between liter and ml, then enter `250 ml` or `0.25 liter`. The amount stays the same when switching. For other container units, enter the number of containers; its configured factor converts to liters. To pour from a container, configure a separate measured-liter selling unit first.
- **Pieces:** enter `1`, `2`, and so on. Half a sealed packet or single-piece bottle is rejected. A configured box can contain several whole pieces; verify the selling unit before charging.

Check the quantity, selling unit, final cash due and change. Save the cash sale once. Brief offline sales use the downloaded catalog and the same conversions; after reconnection, synchronize and reconcile.

## Returns and stock checks

Refund and physical-return quantities use the **original receipt selling unit**. A return of `0.125 Liter` means 125 ml. A return of `0.25 Meter` means 25 cm of rope. Only actual inspected saleable goods return to available stock; segregate held or uninspected goods. A cut length may need inspection before it can be sold again.

Stock counts, low-stock thresholds, transfers and discrepancy reports record the product's base measurement: kg, liter, meter or piece. Liquid receipt, transfer and count forms now offer explicit ml entry and display its recorded liter equivalent. For example, count 9.75 liters or choose ml and enter 9,750 after selling 250 ml from 10 liters. Do not enter 9,750 in a field labeled liter.

A saved mistaken refund can use the [owner correction procedure](refund-corrections.md) when cash is fully accounted for and its stock effects are still untouched. Product setup does not certify product-specific handling, dispensing or packaging rules; configure the units for how the store actually sells each item.

## Purchase, transfer and count using meters or ml

The **entry unit** controls what you type. The **Recorded** line shows exactly what will be saved in the product's configured unit and stock measurement. Changing the entry unit preserves the amount. Changing the product clears the old amount so a rope length cannot become a liquid volume by accident.

### Purchase orders and supplier deliveries

1. Open **Purchasing**, then **Request a purchase order**. Choose the supplier and product/unit.
2. Choose the entry unit beside **Ordered quantity**. For a 100 m roll, select **meter** and enter `200`; the recorded quantity is two rolls. For a 500 ml container, select **ml** and enter `3000`; the recorded quantity is six containers, or three liters.
3. Save the request and have the owner approve it. An order itself does not add stock or send a message to a supplier.
4. At delivery, select the approved order and check the actual goods. Choose each field's entry unit before entering its quantity. The supplier document, accepted saleable, held and rejected quantities can use separate entry units, with their exact recorded equivalents displayed.
5. Example: document `3000 ml`, accepted `2000 ml`, held `500 ml`, rejected `500 ml`. Only **2 liters** become available for sale. The **0.5 liter held** stays separate. Rejected goods never enter store stock. Retain the inspection difference explanation and supplier document.
6. Review every equivalent before saving the inspection. For a quick receipt, use the same entry-unit controls beside **Quantity received** and **Quantity on supplier document**. A quick receipt records actual received stock; use the inspected-delivery workflow for separate accepted, held and rejected goods.

### Branch transfers

1. At the sending branch, open **Transfers**. Choose the product/lot and destination.
2. Enter actual rope length in meters. For liquid, choose **ml** beside **Dispatch quantity** and enter the measured volume, such as `375`.
3. Check that the recorded amount is `0.375 liter`, then dispatch once. Source stock decreases by that amount; destination stock does not increase yet.
4. At the destination, confirm the receipt. Record **saleable** and **damaged / held** quantities separately, using their own entry-unit selectors.
5. Example: receive `250 ml` saleable and `100 ml` held from a `375 ml` dispatch. Destination saleable stock increases by **0.25 liter**; **0.1 liter** is held; **0.025 liter** remains outstanding.
6. Investigate the remaining goods. If the owner records `25 ml` as missing, that closes the shortage with evidence. It does not deduct source stock a second time or add the missing goods to destination stock.

### Blind stock counts

1. Synchronize completed records and close every branch shift before starting the count.
2. The first counter chooses the product/lot and enters the physical saleable quantity. For liquid, select **ml** beside **First physical quantity**. A reading of `245 ml` is recorded as **0.245 liter**. Rope uses meters, such as `12.125`.
3. Seal the first count. A different signed-in person measures again and seals an independent recount. That person may use liters while the first used ml; both are compared in the same stock measurement. Neither counter is shown expected stock or the other's sealed quantity during entry.
4. A third person, the owner, reviews the sealed counts and approves any adjustment with evidence. Example: expected `0.25 liter`, both counters `0.245 liter`; approval records a **0.005 liter shortage**. Held stock is not silently changed by a saleable-stock count.
5. If other stock activity makes the count stale, follow the app's refresh/recount instructions. Do not guess an adjustment or reuse an old count.

### Exact amounts and recovery

- Whole-piece products remain whole pieces. Selecting ml is available only for products measured in liters; rope does not gain a volume option.
- The app refuses amounts that cannot be represented exactly with its six-decimal stock precision. It never rounds a physical quantity to make a pack conversion fit. For example, some ml fractions cannot be stored exactly as fractions of a three-liter selling unit: configure/use a one-liter unit instead.
- Keep the original saved request when a response is lost. In **Sync center**, retry the original request; do not enter the same delivery or transfer again. Export a recovery file when required and keep it private.
- Choose the correct lot and verify the actual roll/container factor. A printed bottle size does not automatically authorize selling an opened fraction of a sealed piece product.

## Refunds and corrected deliveries in meters or ml

### Selected-quantity cash refunds

1. Open **Sales & receipts**, find the original confirmed receipt and choose **Partial refund → Check remaining quantities**. The owner needs their own open shift in the receipt's branch, a clear basket and no unresolved saved records before saving a new refund.
2. For rope, select **meter** beside **Refund quantity**. For liquid measured in liters, select **ml** or **liter**. The app shows the exact equivalent in the original receipt unit; the original paid price controls cash.
3. Enter the **financial refund quantity**, then the actual **physical returned quantity**. They can differ: a cash refund does not prove the customer brought the goods back. Enter zero when nothing returned.
4. Choose **Inspected and saleable**, **Hold separately**, **Split between saleable and held**, or **No goods returned**. For a split, choose the entry unit beside the saleable portion and enter only inspected saleable goods. The rest of the physical return stays held.
5. Check **Recorded** under every field. Leave unrelated refund lines blank or zero. Invalid measured quantities block review; they are not silently skipped. Whole pieces stay whole, and the app refuses conversions that would require rounding stock.
6. Enter the refund reference, choose **Review partial refund**, and check the cash, saleable addition and held amounts. Authorize only after checking actual cash and goods. Give the confirmed cash once after the saved result.

Example: a receipt sold one meter from a documented 100 m roll priced at ₱1,500/roll, plus one 500 ml container priced at ₱45. Original paid cash is ₱60. Refunding **0.25 meter + 125 ml** pays **₱15** from those original prices. If only 0.2 meter and 100 ml returned, with 0.15 meter and 40 ml fit to sell, only **0.15 meter + 0.04 liter** enter saleable stock. The other **0.05 meter + 0.06 liter** stay held. Financial quantities with no corresponding physical return do not add stock.

If an original receipt pack unit cannot represent the requested portion exactly, stop and use owner reconciliation. Switching the displayed entry unit does not change the original saved conversion. Do not edit that conversion or round the refund quantity; configure suitable measured units for future sales.

**Full refund** refunds the whole original paid amount. Its physical-return and mixed-saleable fields also accept meters/ml, but smaller physical quantities do not reduce that full cash refund. Use **Partial refund** when only selected quantities should be refunded financially.

### Correct a mistaken saved refund

1. Follow the [owner refund-correction procedure](refund-corrections.md). Account for all original refund cash and goods; only an eligible, untouched refund can be undone.
2. The correction recovers the full original cash amount, removes only that refund's saleable stock additions and cancels its untouched held quantities. It preserves the original receipt and refund.
3. Choose **Prepare corrected refund**. Prefilled quantities start in the original receipt unit. Choose meter/ml beside each field before editing; switching keeps the physical amount unchanged.
4. Set the correct financial and physical quantities, review again and save the linked replacement once. If no goods should enter stock, enter physical zero and choose **No goods returned**.

In the example above, undoing the mistaken ₱15 refund restores ₱15 to the correcting drawer and reverses its exact measured goods. A linked replacement for **0.125 meter + 50 ml**, with no goods returned, refunds **₱6.38** and adds no stock. With a ₱100 opening float and no other activity, the drawer is **₱153.62**. The last centavo follows the original paid-line allocation; never override it by changing a physical quantity.

### Correct a mistaken saved delivery

1. Close/synchronize branch shifts and follow the [delivery-reversal procedure](delivery-reversals.md). An owner checks the complete proposed reversal and actual goods. Later stock, count, held-goods or supplier activity can block automatic reversal.
2. Reverse the eligible original inspection once. This removes its original saleable effect, cancels original held goods and restores the appropriate unreceived order quantities. It does not pay cash, issue supplier credit or physically return goods.
3. Choose **Prepare corrected delivery**. The original quantities are prefilled in the recorded delivery unit. Change each field's entry-unit selector to meter/ml when needed; the amount is converted, not reinterpreted.
4. Enter the actual document, accepted, held and rejected quantities separately, then review all recorded equivalents and save the linked correction once.
5. Example: a corrected liquid inspection of document **200 ml**, accepted **125 ml**, held **25 ml**, rejected **50 ml** adds **0.125 liter** saleable and **0.025 liter** held. Rejected goods do not enter stock. From an otherwise unreceived three-liter order, the unreceived balance is **2.85 liters**.

If any save loses its response, keep the original request in **Sync center** and retry it. Recovery files preserve original receipt-unit quantities, correction links and request IDs. Do not create another refund or delivery to replace an uncertain save, and do not hand out cash again merely because a retry succeeds.

## Damaged stock, held goods and purchase-cost losses

### Record actual damaged or spilled goods

1. Open **Inventory → Damage, spillage and other stock issues**. Choose the correct product and lot.
2. For liquid stock measured in liters, choose **ml** beside **Issue quantity** and enter the measured volume. For rope, enter meters, including exact fractions such as `1/4`. Whole-piece products still require whole pieces.
3. Check the **Recorded** stock equivalent. Changing the product clears the previous measured amount.
4. Choose the actual category and physical disposition. **Remove from sale and hold separately** means the goods still exist but cannot be sold. **Goods consumed, missing or disposed** records a direct removal after approval. Do not guess that an unexplained difference is theft or erase it as damage.
5. Enter evidence, submit the issue, then have the owner inspect and approve it. Submission alone does not change stock. Approval removes the measured quantity from saleable stock once; held goods remain separately tracked.

### Inspect and resolve held goods

1. Keep held goods physically separate. Find the correct product/lot under **Held goods** and check its remaining quantity. Liquid rows show liters and ml together.
2. The owner chooses **Record held-goods outcome**, then the entry unit and actual quantity being processed.
3. Choose the real outcome: release inspected goods for sale, dispose/write off, or return to supplier. Record inspection evidence and save once.
4. Only **release** adds back to saleable stock. Disposal and supplier return reduce the held balance without deducting saleable stock a second time. Expired goods cannot be released for sale, and no outcome can exceed the remaining hold.

Example from a 10-liter starting balance: approve a **250 ml** hold, leaving **9.75 liters saleable + 250 ml held**. Release **100 ml** after inspection: **9.85 liters saleable + 150 ml held**. Dispose **125 ml**: saleable stays **9.85 liters**, with **25 ml held**. Return the last **25 ml** to the supplier: held becomes zero; saleable remains **9.85 liters**. The posted held loss is only the **125 ml disposed**. The supplier return is a separate authorised removal.

### Value losses from the purchase document

1. Open **Overview → Stock loss at purchase cost**. Choose the branch/date range and removal category. Missing documentary cost is shown as unvalued, not as a free loss.
2. Find the loss source and its removed quantity. Liquid loss rows show the exact ml equivalent; stock reconciliation and CSV quantities remain in the stated canonical base unit.
3. Choose **Record purchase cost** and select the actual purchase unit on the supplier/opening-stock document. Enter the cost of **one** such unit. For example, `₱25 per 500 ml container` is different from `₱25 per liter`.
4. Read the removal-value preview before saving. Changing the purchase unit clears the entered amount, so an old container cost cannot silently become a per-liter cost. Enter the document reference and explanation, then save the evidence. The server confirms the valuation.
5. If documentary cost was wrong, use **Record corrected purchase cost**. Earlier versions remain in purchase-cost history. A cost correction changes report value only; it does not change stock or cash.

At **₱25 per 500 ml container**, a **125 ml** disposal is **₱6.25**. At **₱1,000 per 100 m roll**, a **0.25 m** loss is **₱2.50**. A separate **50 ml** spill at the same container cost adds **₱2.50**, making **₱11.25** posted losses. A **25 ml supplier return** is **₱1.25** in other authorised removals, separate from the loss subtotal. Correcting only the disposal row to a documented **₱30 per container** changes that row to **₱7.50** and the loss subtotal to **₱12.50**, with all stock quantities unchanged.

Money is rounded once for each complete loss row, then row values are added. Do not round a per-ml price first. At a test cost of **₱0.03 per 500 ml**, a 249 ml row is one centavo and a 250 ml row is two centavos. Both quantities stay recorded exactly even when a very small valued row rounds to zero centavos. These are test examples, not your store's actual costs.

If a save loses its response, use **Sync center → Retry original request**. Recovery exports retain the exact base quantity and permanent request ID. Do not enter the same disposal or issue again to replace an uncertain save. Assign and investigate unresolved differences; the report cannot establish why goods went missing.

### Find every held record and pending issue

1. Open **Inventory** and check the loaded count under **Held goods** and **Damage, spillage and other stock issues**. The first page shows up to fifty records, oldest first.
2. Use **Load more held goods** or **Load more stock issues** to reach additional records. Loading one list keeps the other list available. An end message and disabled button indicate that the matching list is fully loaded.
3. If a page fails, retain the loaded records and retry the same load button online. A page read never changes stock, approves damage or records a loss.
4. Before acting, refresh and check the physical goods, correct product/lot and remaining quantity. Another employee may have processed a loaded record. The server checks the current quantity and authority again on save.
5. After a successful approval or held outcome, the list refreshes from its first page. Use **Load more** again when needed; previously saved evidence remains retained.

### Read a report when filters fail to load

The snapshot, date range, branch scope and category printed below the report filters describe the loaded rows, totals and CSV. If a requested filter fails, those previous rows are kept and a notice identifies the retained snapshot. Loading more rows continues that same snapshot; it cannot add supplier returns to a loss-only page. Choose **Apply loss-report filters** again online to load the requested report. The notice clears when that report loads. CSV still exports only the loaded rows; load every matching page before using it as a complete row list.
