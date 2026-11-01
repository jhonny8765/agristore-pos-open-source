# Fixed Magpet Branch configuration

Requested November 1, 2026: the Better Yield installation operates **Magpet Branch** only. Customer accounts cannot add or rename branches. Additional branch setup is a separate maintainer change; there is no customer unlock or payment control in the app.

## History and access

Keep the existing Magpet branch ID, stock, cash and ledger. The other branch rows are retained as inactive historical references; do not delete or merge their sales, stock, devices, investigations or movement history. In particular, Test Branch 4 contains 400 completed test sales. Their history must not become Magpet transactions.

`branches.active` controls the list; `management_locked` identifies the fixed setup. Both are readable but customers have no table-write grant. A database trigger blocks branch creation, rename and deletion through owner/legacy commands when the setup is locked. The command dispatcher rejects new work at inactive branches and transfers to inactive destinations; report-all-branches requests cannot mix archived figures into the configured branch's report. Exact retries of already committed original sales remain acknowledgments only.

The fixed branch displays as text in the header. Settings shows its name without add/rename fields. Transfer navigation and all-branch loss-report controls are absent. The generic open-source application remains configurable for other installations; the Better Yield organization is explicitly restricted by privileged database configuration.

After an online refresh, a profile formerly set to a removed branch retires only its cached authorization/device ID and loads the enabled branch. Saved sales and uncertain requests remain intact. The owner registers the resulting new PC identity at Magpet when opening its next shift. Devices belonging to removed branches are disabled on the server. Offline clients must reconnect and update before using this setup; server changes cannot instantly reach a disconnected PC.

## Rollout

1. Pass application checks, the database suite, genuine Supabase/Auth browsers and encrypted dump/restore. The new single-branch scenario checks removal of controls/API bypass attempts, retained archived receipt/payment/stock, a replacement PC setup, half-kilo Magpet checkout, offline reload and accessible desktop/mobile layouts.
2. Apply the backward-compatible schema migration to the intended staging project. Deploy and verify the corresponding application Preview.
3. In one privileged maintenance transaction, check the intended organization/branch identities, no open shifts, no unfinished transfers/counts; lock the affected branch/shift tables; set Magpet's exact name and active flag, mark the others inactive and lock management. Disable only other-branch devices. Record a configuration audit event with the responsible owner identity. Do not publish organization-specific IDs in generic migrations or fixture code.
4. Verify the authenticated branch list contains only Magpet Branch, owner add/rename requests fail, no historical sales/payments/movements changed, and the staging alias points to the verified source. Keep a private record of the old branch configuration for deliberate recovery by the maintainer.

Local and CI verification/release evidence will be added after completion. This change does not complete the physical PC endurance test, actual opening stock, staff rehearsal, production backup or store pilot gates.
