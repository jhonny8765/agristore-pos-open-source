# Recovery download verification — October 28, 2026

## Behavior

The Sync center and Settings recovery controls identify the exact prepared filename and part. They report sale records separately from stock/owner requests, so an operations-only file is not presented as empty. Feedback says the download started and asks the cashier to check Downloads or the chosen folder; it does not claim the file was saved.

**Download this part again** repeats the latest part byte for byte without advancing the export or modifying a checkout, cash, stock or request. Only the last prepared part is retained in memory: at most 1,000 sales, with requests included in the first part. Account, branch and sign-out changes clear this state; a generation check prevents an asynchronous export from downloading after an identity/context change. Exports and retries share the normal operation lock. No recovery format, schema, dependency or business rule changed.

The application-cache label now says **Offline files ready**, so active cached files are not mistaken for proof that a Windows app is installed. The install instructions refer to the current browser rather than assuming Edge.

## Verification

- Local type checks, lint, 322 unit tests and production build passed.
- All 23 local practice browser scenarios passed, including the new 1,001-receipt multipart case: both first/final parts retried with identical filenames and bytes, exactly 1,001 original IDs remained pending, Settings showed the same last part and reloading cleared only the prepared-download controls.
- The genuine database/authentication suite adds an assertion that an operations-only recovery export visibly shows zero sales and one stock/owner request before its existing lost-response restore test.
- Desktop and 390-pixel layout inspection confirmed readable filename wrapping, a 43-pixel retry button and no horizontal page overflow. The mechanical design scan returned no findings. Existing forest/paper styling is retained.
- Final free public-source [CI run 40591229450](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40591229450) passed on `3e2078d7da91a8b5e8b5eebf3c81b881659448a3`: 322 unit tests, 23 practice browser scenarios, 51 genuine Supabase/Auth browser scenarios, 811 pgTAP assertions across 17 files, strict database lint and a real disposable 40-table dump/restore. The operations-only lost-response purchase-cost restore case passed with its new visible-count assertion.
- Private application source `1a64758cd5e59a0ae8176221db41814a25a75a3f` was built as READY preview `dpl_QdNL4wqrndWwSVQJxG2EiXqvx1Vv`. After the full gate passed, the existing staging alias was assigned to it and independently read back against the expected project and source commit. Only documentation was uncommitted during upload; application/test source was committed. No production deployment was made.

- The installed staging app applied the guarded update with an empty basket, clear queue and no open shift. Settings showed storage protection granted and the new cache/recovery labels. Exporting with no unresolved records correctly displayed zero sales and zero stock/owner requests; retry retained the exact same archive filename. The screenshot is retained privately. No real outage or Windows restart was performed.

See [recovery download instructions](recovery-downloads.md). Browser checks use synthetic/disposable test data; they do not certify physical disk behavior or a long-duration PC outage.
