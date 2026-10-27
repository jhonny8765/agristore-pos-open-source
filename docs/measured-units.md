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

Stock counts, low-stock thresholds, transfers and discrepancy reports use the product's base measurement: kg, liter, meter or piece. For example, count 9.75 liters after selling 250 ml from 10 liters. Do not enter 9,750 in a field labeled liter.

A saved mistaken refund can use the [owner correction procedure](refund-corrections.md) when cash is fully accounted for and its stock effects are still untouched. Product setup does not certify product-specific handling, dispensing or packaging rules; configure the units for how the store actually sells each item.
