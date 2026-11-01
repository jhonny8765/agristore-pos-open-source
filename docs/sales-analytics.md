# Use sales analytics

Owners and the assigned branch manager can open **Overview → Sales analytics**. Magpet remains the only enabled branch in this installation. Cashiers and stock staff cannot open the owner report or bypass that restriction through the API.

## Choose the dates

1. Connect to the internet and synchronize every cashier PC. Pending offline purchases are not yet in this report.
2. Choose **Today**, **This week**, **Last week**, **This month**, **Last month**, **Last 12 months**, or **Choose dates**. Custom ranges can cover at most 366 days.
3. Choose **Day**, **Week** or **Month** under **Group sales by**, then press **Apply sales period**.
4. Read the displayed branch, actual dates, comparison dates and snapshot time. All dates use **Asia/Manila**; weeks start Monday. Current periods are incomplete, so consider the displayed dates when comparing them with completed earlier periods. Month-to-date comparisons stop at the same calendar day of the previous month, capped at its final day.

The report shows:

| Figure | Meaning |
|---|---|
| Gross sales | Original confirmed purchases whose sale date falls inside the period, before refunds |
| Completed purchases | Number of distinct completed receipts, including two separate identical purchases |
| Average purchase | Gross sales divided by completed purchases, rounded to centavos |
| Refund cash paid | Refund payouts posted during the period, including refunds for older purchases |
| Cash recovered | Recorded cash recovered when correcting mistaken refunds during the period |
| Sales less refund cash | Gross sales minus refund payouts plus recovered refund cash; it can be negative |

These figures are **not profit, customer credit, official tax invoices or the cash counted in a drawer**. Use the shift's cash reconciliation for the drawer. A later refund does not rewrite the original sale date or erase its original sale. A corrected refund retains the original payout, its cash recovery and any replacement payout.

A sale saved offline enters the report only after the server confirms it, under its original sale date. A delayed upload can therefore increase an earlier day's report when refreshed. Each CSV is a snapshot at its exported time, not proof that every cashier PC had already synchronized.

## Read the trend

The bars show gross sales. Zero-sales days/weeks/months remain visible. Scroll the chart when needed, or group a long period by week/month. Open **Show exact sales and refund totals by period** for the original amounts and distinct purchase counts. **Export sales trend (CSV)** exports all buckets in that loaded snapshot.

## Find popular products

**Most purchases** ranks a product by how many different receipts contain it. One receipt containing a sack and loose kilos of the same product counts once for that product. **Highest gross sales** instead ranks its original sales value.

Each row shows its own exact base quantity: kg, liter, meter or piece. Never add unlike units to judge popularity. The report uses the original recorded conversion and paid line amounts; product names/SKUs identify the current catalog record, while the original receipt remains the historical name/price evidence. Inactive products with historical sales remain reportable.

Rankings and quantities are **before refunds**, including products later returned. They describe original purchasing demand; refund cash appears separately above. Do not interpret these quantities as current stock or net retained goods.

Search by name/SKU, or use **Show 20 more products**. **Export all product totals (CSV)** includes every product sold in that selected report, even when the table shows only twenty or a search hides some rows. The export carries branch, dates, snapshot and product IDs; protect it as a business record.

## If the report cannot refresh

Keep the existing report and read its displayed snapshot. A failed date change leaves the original figures and exports together; it never labels old figures as the requested new period. Reconnect and press **Refresh sales analytics** to retry. The report is not cached as a complete offline sales database and cannot include purchases still waiting on another PC.

If **Sales analytics could not be verified** appears, the app rejected an incomplete or inconsistent response. It checks the requested branch and dates against the server snapshot, exact totals, comparison arithmetic, complete calendar buckets and product totals before replacing the report. The last verified report and its original CSV exports remain available. Refresh online; if the message repeats, report it to the maintainer with the displayed branch, dates and snapshot time. Do not clear the browser's site data or recreate sales to fix a report.

These checks detect inconsistent responses; they do not prove that every physical transaction was recorded or that a recorded quantity was measured correctly. Continue daily cash and stock checks.

Viewing, filtering, sorting and exporting analytics create no sale, payment, refund, stock adjustment or journal movement. Continue daily physical cash and stock reconciliation during the Magpet pilot.
