# Check the cost of missing stock

Use **Overview → Stock loss at purchase cost** while connected. Owners can read every branch and record cost evidence. Branch managers can read their own branch. Cashiers and stock staff cannot open this cost report or set its costs.

## 1. Confirm the missing quantity first

Complete the stock-control procedure before putting a peso value on a loss. A count shortage needs the existing independent blind count, recount and separate owner approval. A stock issue, held-goods disposal or transfer write-off needs its own documented approval. This report reads those posted records; entering a cost never removes stock or approves a shortage.

An unexplained shortage is not proof of theft. Keep the original counts, delivery documents, transfer evidence and investigation notes.

## 2. Choose which records to check

1. Select a branch in the top bar. Branch switching requires a connection and a closed cashier shift.
2. Open **Overview** and find **Stock loss at purchase cost**.
3. Choose **Loss report from date** and **Loss report through date**. The default is the current month. Dates use Asia/Manila and refer to when the stock-book entry was recorded, not an editable supplier date. Through date includes the entire day. Leave a date blank for an open-ended range.
4. Choose **Posted losses / write-offs**, **Authorised use / supplier returns**, or **All recorded removals**. An owner may check **Report all branches**.
5. Press **Apply loss-report filters**. Editing a field alone does not change the loaded report. Check the printed branch, date range, category and snapshot time before using its figures.

The documented-loss subtotal always covers all posted loss rows in the applied branch/date range, regardless of the row-category filter or the number of pages loaded. Authorised use and supplier returns have a separate subtotal.

## 3. Attach the purchase cost

**Cost not documented** means the loss is unvalued. It does not mean the stock was free. The incomplete-valuation warning shows how many loss rows still need evidence. The application does not silently substitute selling price or today's catalog cost for an undocumented historical purchase cost.

For each loss row, the owner should:

1. Find the supplier invoice or signed opening-stock/acquisition record that supports the cost of the missing goods.
2. Press **Record purchase cost**.
3. Choose the **Purchase-cost unit** printed on that document, such as a 50 kg sack or a kilo.
4. Enter the peso cost of **one selected unit**, not the entire delivery and not the missing quantity. Include allocated acquisition costs only when the source supports the allocation.
5. Enter the **Purchase-cost document reference** and a **Purchase-cost explanation**. Keep the actual source document in the store's records; this form stores its reference and explanation, not an uploaded invoice image.
6. Press **Save cost evidence**. The report refreshes with the owner name, recording time, source reference and calculated value.

Example: a supplier record supports **₱1,250 for one 50 kg sack**. A verified **0.25 kg shortage** costs `0.25 × ₱1,250 ÷ 50 = ₱6.25`. A 0.5 kg shortage costs ₱12.50. The system converts exact base quantities and rounds each loss row once to centavos, then adds those row values.

If a document really supports a zero acquisition cost, enter `0` and explicitly check **Document confirms zero acquisition cost**. Do not use zero to clear an unknown cost. If costs differ between purchase lots, use evidence appropriate to the goods in that loss. A mixed or unidentified lot needs an owner-supported allocation before its value is trustworthy.

This is a documented operational loss valuation. It is not an automatic FIFO or weighted-average inventory accounting engine, and it does not independently verify a document's authenticity.

## 4. Correct mistakes without erasing history

Press **Record corrected purchase cost**, enter the corrected unit/cost/reference and explain the correction. The latest version supplies the current report value. **View purchase-cost history** retains earlier versions, including who recorded them and when. Changing a selling price or catalog cost does not reprice this evidence.

If another owner records a correction while your form is open, refresh before entering a new correction. A stale form cannot overwrite that owner's evidence. A report already loaded keeps its timestamp until refreshed; older cost versions remain readable.

If saving is interrupted, open **Sync center** and **Retry original request** as the same owner. Do not invent a second cost entry to replace a request whose result is unknown. The saved operation retains its original ID through recovery-file export/import. Resolve pending requests before changing accounts. Cost recording and corrections require connectivity.

## 5. Read losses separately from goods still under review

| Record | Treatment |
|---|---|
| Approved negative count adjustment | Posted shortage; needs documented cost |
| Approved direct stock write-off | Posted loss unless classified as authorised staff/owner use or supplier return |
| Goods moved into a hold | Held separately; not automatically a financial loss |
| Confirmed disposal from a hold | Posted loss once; the initial hold is not counted again |
| Dispatch awaiting receipt | Outstanding transfer, not automatically a financial loss |
| Owner-approved missing-transfer write-off | Posted once against the dispatch branch; not counted again at the destination |
| Supplier return / authorised staff or owner use | Separate other-removal subtotal; supplier credit settlement remains outside this valuation |
| Positive count adjustment | Shown in quantity reconciliation; does not cancel the loss subtotal |
| Pending count, supplier-document difference or unresolved case | Review in Inventory; not automatically a posted financial loss |

The absence of posted loss rows does not prove there is no missing physical stock. Unrecorded problems first need proper counting and investigation.

## 6. Reconcile and export

**Stock reconciliation** shows each branch/product/lot separately. Starting book quantity plus signed opening imports, purchases, sales, saleable returns, transfers, shortage/surplus adjustments, direct write-offs and hold movements equals closing book quantity. Negative quantities reduce stock. Held goods and outstanding dispatch are separate balances at the cutoff; do not add them into that equation. Kilos, liters and pieces are not summed together.

Both lists load 50 rows at a time. Use **Load more loss rows** and **Load more stock reconciliation** until the required rows are visible. The financial subtotals cover the complete range; each **Export loaded … (CSV)** contains only the rows already loaded, with scope, dates, source IDs and exact numeric fields. Keep these business exports private.

A network failure retains already loaded rows. Reconnect and refresh for current information. The report cutoff is a recorded-time bound, not a locked accounting close across separate database requests; refresh after concurrent posting has settled before approving final monthly figures.
