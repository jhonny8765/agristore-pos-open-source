# Maintainer safeguards verification — October 28, 2026

## Delivered behavior

Settings → PC checks & store guide displays a public build identity and offers **Download support report**. It refreshes the scoped IndexedDB counts and browser storage observations before creating the file, works offline and explicitly distinguishes this report from recovery exports. No report is transmitted automatically. The JSON allowlist excludes receipt payloads, fingerprints, raw errors, employee names/IDs, device IDs, passwords and session credentials; it includes permitted branch/organization identifiers and aggregate health data.

Unconfirmed-sale age follows the original purchase timestamp, not the retry timestamp. A connected browser with an original sale waiting at least fifteen minutes receives an **Action needed** message to check access/server availability. Intentional offline waiting remains **Review**. Unknown/future clock evidence receives a clock warning. Other-view records affect only the aggregate warning count; their dates and contents cannot make this view's oldest sale appear stale.

There is no PostgreSQL migration, IndexedDB upgrade, recovery-format change or stock/cash write in this change. Local schema stays version 2, sale contracts version 1 and recovery files version 2.

## Verification

- Local type checks, lint, 328 unit tests across 25 files and production build passed.
- Four targeted real-browser tests passed: two existing guarded-update cases, the new earlier-shell cache recovery case and the new private offline support-report case. A connected old sale escalated; report export re-read an additional receipt added after the screen's initial check, included only permitted counts, and left all original records unchanged.
- The earlier-shell test uses a real production shell and Workbox manifest on loopback, publishes revision two and then republishes revision one. Two pending receipts retain their complete original IDs/payloads through a real browser-process close and offline restart. This uses compatible current JavaScript/schema; it does not certify arbitrary older code, database migration reversal, Windows restart or production rollback.
- Desktop and 390/320-pixel inspection showed no horizontal page overflow; the support button was 43 pixels high and filenames wrapped. The mechanical detector returned no findings.
- Final free public-source [CI run 40593967603](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/40593967603) passed on `72976e75c98588cfdb8900c634f90e5c30ee6809`: 328 unit tests, 25 practice browser scenarios, 51 genuine Supabase/Auth browser scenarios, 811 pgTAP assertions across 17 files, strict database lint and a real disposable 40-table dump/restore. The authenticated operating-guide case verified the report's exact permitted scope and exclusion of fixture email/password, plus 1440/390/320-pixel accessibility/layout checks.
- Private source `1d9c2112a56975e586a59d6a713b5d6d573cf235` built as READY preview `dpl_6BCVo9qfSoaUzuAMkq5bXvg96mDw`. After the gate passed, staging was assigned to it and independently read back against the expected project/source. The previous working deployment remains retained. No production release, schema change or cloud backup configuration occurred.

- The installed staging app applied the guarded update and displayed the exact preview build identity. Its support JSON was found in the chosen download folder and independently checked: expected release/permitted branch, zero unresolved sales or stock requests, no saved cashier authorization and no credential/receipt fields. The original 400-sale server comparison still matched every original payload, exactly 400 payments/movements, ₱3,850 combined simulated cash, 140 kg stock, zero open shifts and four unchanged other-branch sales. Private report contents and screenshots are ignored rather than published.

See [the maintainer incident, update, rollback and backup procedure](maintainer-operations.md). No external alert delivery, production backup schedule or production-backup restoration is claimed. Physical hardware/endurance, real opening data, staff and signed pilot acceptance remain separate gates.
