# Expiry reminders and assigned investigations

Use **Inventory** while connected as an owner, branch manager or stock employee. Choose the correct branch first. Cashiers do not have access to this workspace.

Reminders use the recorded stock, lot and expiry information. Enable expiry tracking for the relevant products and verify lot/expiry entries during receiving and opening-stock import. The software cannot read a physical expiry label for you.

## Check expiry reminders

1. Read the **As of** time in Asia/Manila. Select **Refresh reminders and investigations** before acting on stock.
2. Use **Look ahead** to choose 7, 30 or 90 days. The initial window is 30 days.
3. Use **Expiry filter** for expired goods, goods expiring today, approaching expiry or missing expiry information. A missing date is a request to inspect the actual label; it is not a safe-to-sell result.
4. Read the product, lot, expiry, base unit, on-hand quantity and separately held quantity. A lot with no saleable quantity can still appear while goods remain held. Empty lots disappear only when neither saleable nor held goods remain.
5. Physically separate expired goods. Use **Record stock issue** below to request a hold and obtain owner approval. Reminders alone do not deduct stock, dispose goods or establish the cause of a shortage. Existing checkout expiry validation remains in force.
6. Select **Load more expiry reminders** until the required rows are loaded. The server returns at most 50 rows per page; the totals describe the complete selected branch/window.

## Give an unresolved investigation to a person

1. Under **Stock investigations**, select **All unresolved**, **Overdue**, **Due today**, **Unassigned / needs reassignment**, or **Assigned to me**.
2. Review **Recorded details**, the source ID, responsibility, deadline and latest progress. Use **Load more investigations** to reach cases beyond the first 50. Cases stay ordered oldest first rather than disappearing behind new activity.
3. As the owner or branch manager, select **Assign follow-up** for the relevant case.
4. Choose an active stock employee, manager or owner authorized for that branch. Cashiers, inactive accounts, employees from another branch and people from another business are not valid choices.
5. Set **Follow-up due date** and write **Assignment instructions** explaining the physical goods or documents to check. Past dates are allowed when recording an already missed deadline; the case will show **Overdue**.
6. Select **Save assignment**. Read the confirmation. Responsibility and deadline change; the investigation remains open and stock does not change.

## Record progress and finish the investigation

1. The assigned employee signs in with their own account and chooses **Assigned to me**. The owner or branch manager can also record progress.
2. Select **Record progress**, enter concrete evidence and outstanding questions, then **Save progress**. A progress note does not close the case or remove an overdue status.
3. If responsibility becomes inactive or no longer applies to that branch, the case appears under **Unassigned / needs reassignment**. An owner or manager assigns a valid replacement.
4. Only the owner uses **Resolve investigation** after checking the evidence and documenting the outcome. The existing transfer rule still prevents resolution while dispatched goods remain outstanding.
5. Review assignment and progress events in the owner's **Overview → Audit register**. Earlier events remain immutable even when the worklist displays a newer assignment or progress note. Resolution does not itself adjust physical stock; any stock correction follows its separate approved workflow.

## Interrupted work

- If the response is interrupted, open **Sync center** and use **Retry original request**. Do not start a different assignment to guess whether the first one succeeded. Its original request ID remains saved on the PC.
- Export a recovery file when necessary and keep it private. Operation-only recovery works with cashier shifts closed; the original employee and business/branch restrictions still apply.
- A changed-content retry under an existing ID is rejected. A stale form is also rejected if another employee has changed the follow-up; refresh before editing it again.
- Offline forms are disabled, current information requires connectivity, and already loaded records are retained with reconnect guidance. Saved pending requests are preserved if access is revoked; restored commands still require current server authorization.

The reminder time is a snapshot, not a promise that the physical goods or staff permissions have not changed since it was loaded. Add this check to the opening and closing stock routines. Actual labels, responsible staff accounts, stock counts and an operational branch pilot remain necessary.
