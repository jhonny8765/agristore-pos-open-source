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
