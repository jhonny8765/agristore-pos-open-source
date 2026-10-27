# Running the POS as the merchant's website maintainer

The website maintainer runs the hosting, database, updates and technical support. The merchant's owner manages business access, physical stock decisions and staff procedures. Account ownership is not being transferred as part of this work.

## When a cashier reports a problem

1. Ask for the affected branch, what they were doing, the actual time, the exact visible message and whether **Sale saved** appeared. Preserve the original reference; do not ask for their password.
2. Open **Settings → PC checks & store guide**. Read the application version and select **Download support report**. Verify the file exists in Downloads or the chosen folder and send it privately to the maintainer. It includes permitted counts, branch identifiers, storage/authorization observations and version; it excludes receipt payloads, employee names and credentials. This is a manual download; no report or alert is automatically sent.
3. If sales or stock/owner requests remain unconfirmed, separately export **every recovery part** from Sync center. The support report cannot restore a sale. Keep the original browser profile/site data and all recovery files.
4. Check Sync center using the original employee's account. Distinguish ordinary offline waiting, authentication required, retryable failures and owner review. Retry original IDs only. A 15-minute connected waiting warning means investigate access/server reachability; a browser connection icon does not prove the server accepted anything. Intentional offline waiting remains a review warning.
5. Compare original IDs and payloads, payments, cash and inventory movements after reconnecting. Close the incident only when every affected original record is accounted for; keep any separate stock investigation open until its business evidence is resolved.

## Decide what can safely continue

| Observation | Immediate action |
|---|---|
| Internet is unavailable; same authorized shift and successful local saves | Continue within authorization using the same tested profile; retain each completed sale and confirm on reconnect. |
| Local save fails or no success appears | Keep the basket and evidence. Do not hand goods over as a completed POS sale or create another checkout to fix uncertainty. |
| Sign-in required or access denied | Renew the correct identity or ask the business owner to check access. Preserve requests; do not share passwords or bypass roles. |
| A completed sale is missing, duplicate cash/stock effects appear, or stored totals differ | Stop the affected live workflow/pilot, protect originals and recovery files, compare the ledger and repair using an audited correction. Do not hide the discrepancy with an invented sale, refund or stock adjustment. |
| Clock/storage warning | Verify Windows automatic time and available disk/browser space. Preserve site data. Browser quota is not a disk-health or backup certificate. |
| Printer fails after saving | Reprint the original saved receipt when available; do not enter the sale again. |
| App fails to open after a release | Preserve the profile and records; use the release procedure below and confirm compatibility before reverting any website version. |

## Release and rollback procedure

Before release, record the source commit, passing CI run, previous and candidate deployment IDs, stable origin, database migrations, local IndexedDB schema and sale/recovery contract versions. Keep the previous working deployment. For this follow-up, PostgreSQL has no new migration, IndexedDB remains version 2, sale contracts remain version 1 and recovery exports remain version 2.

1. Build the candidate as a preview. Pass application, practice-browser, real Supabase/Auth, permission/database and disposable restore checks for the actual source. Keep real business data out of public fixtures and logs.
2. Test the candidate at the normal staging origin before a production change. Verify sign-in, roles, pending history, a TEST checkout and exact cash/stock outcomes. Record results; preview loading alone is not acceptance.
3. At the affected cashier, finish the basket and resolve/export every unresolved record before an intentional update. Use the guarded **Check for app update** action. Do not clear site data, uninstall, force-activate a worker or reload other cashier windows.
4. If the new version fails, first compare its database/RPC contracts, local schema and pending-record formats with the proposed older version. A website rollback does not reverse stock/cash or migrate local databases backward. If compatibility is uncertain or an older version cannot read the local schema, preserve the current records and use a forward fix.
5. For the staging alias, the maintainer may reassign the same stable alias to a verified compatible READY preview in the same project, then independently read back the exact deployment/source. For eventual production, follow Vercel's [rollback procedure](https://vercel.com/docs/instant-rollback); prior build configuration can differ from current settings. Do not assume current secrets or environment settings are applied to an older build.
6. Account for the installed service worker: an already-open window may retain its current version. Use the guarded update when work is safe. If no windows remain, a waiting worker can activate normally; preserve original pending records across reopening. Never assume changing the hosted alias instantly changes every offline cashier.
7. After either rollback or a forward fix, verify the actual application version, original receipt IDs/payloads, pending states, branch, catalog, payments and ledger/projection. Reconcile physical cash/stock. A restored page does not by itself close the incident.

The automated older-shell test republishes an earlier Workbox/root-cache revision, keeps two original pending receipts and checks them after a real browser-process close and offline restart. It uses compatible current JavaScript and schema; arbitrary historical releases, Windows restarts and production rollback are separate checks. It changes no hosted alias or business records.

## Backups and long-term operation

Before real selling, record the production project, backup destination and encryption/key custodian, retention, schedule, maximum acceptable data-loss window, maximum recovery time and responsible maintainer. Protect keys outside source code and client bundles. A backup on the same cashier disk is insufficient for disk loss. Choose and approve the production services before configuring paid features or off-site storage access.

Restore an actual scheduled production backup into a separate isolated working environment. Record the backup ID/time, restoration start/end, migrations, table content fingerprints and checks of sales/payments, stock/ledger, holds, transit, costs and audit evidence. Test sign-in/application access using controlled identities, without copying live credentials into logs or using the restored copy for customer transactions. Record any gap against the agreed recovery objectives.

A passing disposable CI dump/restore is useful software evidence; actual production backup scheduling, retained encrypted copies and a production-backup restore still require configuration and proof. No production backup schedule or external alert delivery was established by this follow-up.

During the pilot, review original pending sales/requests and cash/stock daily. Review overdue investigations, held goods, transfer differences and staff access with the business owner. Track hosting/database growth and completed backup runs. After major changes, rehearse recovery against the intended release and formats. Keep a named human maintainer and an agreed contact/escalation method.

## Remaining launch evidence

The physical sixty-minute outage, eight actual hours, Windows restart, chosen cashier PC, scale/printer, verified opening counts/costs, independent staff rehearsal and production backup/one-branch acceptance remain open. Use the recorded hardware results and [pilot checklist](pilot-checklist.md); do not describe the website as production-ready from software checks alone.
