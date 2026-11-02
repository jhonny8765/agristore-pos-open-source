# Published Magpet site: sales and stock verification

Verified November 2, 2026 at <https://better-yield-magpet-pos.pages.dev/>. The current release is **`cf-mvyjyph5`**. This is a pre-pilot TEST business, not evidence of actual store cash, physical inventory or Windows endurance.

## Published build and browser checks

- The live health endpoint returned 200 with the expected release and a current timestamp. Its backend probe is dynamic and read-only. All 41 public application assets checked matched the prepared build byte for byte.
- All **21 published-site Practice browser cases** passed, including 200 offline checkouts, aborted local transactions, original checkout IDs on retry, fractional kilos, grams, peso estimates requiring measured confirmation, whole packets, recovery downloads, authorization/expiry checks, security headers and accessible narrow layouts. The same 21 cases passed again after the message fix was published. These Practice records never entered the hosted business: the initial before/after fingerprints of all 40 business tables matched.
- Local strict type/lint checks, the connected Pages production build and **466 unit checks** passed. The small code change is limited to explaining the existing registered-PC refusal; database permissions, transaction logic and uniqueness constraints are unchanged.
- The [complete source regression gate](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/41370479050), public source `01aa292`, also passed: 466 unit checks, 1,172 database assertions, 26 practice, 59 genuine local Supabase/Auth and 35 fixed-Magpet browser runs, strict checks and the encrypted 40-table restore. Cloudflare-only cases are deliberately skipped in that existing-platform gate; the additional 21 published-site cases above cover the actual Pages serving path. These counts include selected cases repeated under Magpet configuration.

## Genuine signed-in, hosted TEST rehearsal

The owner account signed in successfully. The first shift-opening attempt correctly refused a second active cashier registration but displayed a raw uniqueness error. The existing Magpet registration belonged to a previous TEST setup and every old shift was closed. The owner workflow retired that registration with a recorded TEST migration reason, retained its recoverable history, and registered the new browser. A simulated drawer opened with **₱100**.

Only existing, explicitly labelled TEST products were sold. A tab-scoped network outage was enabled; the rest of Windows and unrelated websites stayed connected. The following purchases were saved through the ordinary cashier UI:

| Purchase | Recorded quantity | Sale amount |
|---|---:|---:|
| Grower feeds | 0.5 kg | ₱17.50 |
| Grower feeds | 250 g | ₱8.75 |
| Separate identical purchase | 250 g | ₱8.75 |
| ₱50 budget, confirmed simulated weight | 1.4 kg | ₱49.00 |
| Vegetable seeds, recorded lot | 2 packets | ₱130.00 |
| Total | 2.4 kg feed and 2 packets | **₱214.00** |

All five original receipt IDs survived an offline reload. A direct database checkpoint still showed zero uploaded sales for this shift, 500 kg feed and 50 seed packets, confirming that another window had not uploaded them during the outage. After reconnecting, the server held exactly **five sales, five original payments and five sale stock movements**. Feed was **497.6 kg**, seeds **48 packets**, and sale payments **21,400 centavos**. The identical quarter-kilo purchases had separate permanent IDs.

The owner then used the actual online refund controls, with reasons explicitly stating that cash, goods and customers were simulated:

1. Refund one seed packet for ₱65: stock became 49 packets and net sale cash ₱149.
2. Correct that mistaken TEST refund: its original record remained; the correction recovered ₱65 and removed the credited packet. Stock returned to 48 packets and net sale cash ₱214.
3. Refund the now-available two seed packets for ₱130, then fully refund all four feed purchases with simulated saleable returns.
4. Reconcile and close the drawer: opening, expected and counted cash were all **10,000 centavos (₱100)**. No shift remained open.

Final TEST stock returned to **500 kg feed, 400 kg fertilizer and 50 seed packets**. The five original sales remain immutable, with linked refunds/correction; net cash from the rehearsal is **zero**. No test record was deleted to make the totals match.

## Reports and preservation

The published weekly and monthly reports each showed five purchases, ₱214 gross, ₱42.80 average purchase, ₱279 refund cash, ₱65 recovered refund cash and **₱0 sales less refund cash**. Purchase popularity ranked feeds first with four purchases/2.4 kg/₱84; revenue popularity ranked seeds first with one purchase/two pieces/₱130. These match independent receipt and payment calculations. Original gross sales and popularity stay recorded after refunds by design.

Read-only database reconciliation found **zero** sale/item-total differences, original-payment differences, sale/stock-movement differences, ledger/projection differences, duplicate sale IDs, negative on-hand rows or closed-shift journal-total differences. Thirteen preservation checks matched the original 404 sales, 408 payments, 427 stock movements, older shifts/audit records, products/units/lots, branch configuration, staff access and final stock projection. The previous uncounted historical TEST drawer remains an unresolved historical physical-cash observation; this rehearsal does not invent a count for it.

## Fix, update and monitoring

The registered-PC error now explains the existing one-PC-per-branch rule and directs the owner to Settings → Registered cashier PCs. It explicitly requires preserving/exporting old pending records before retirement. Its server SQLSTATE and confirmed-rejection behavior are retained. A separate signed-in browser was refused with the new friendly message; no additional shift was created.

The fix was published by uploading the tested ZIP to the existing Free Pages project. The registered browser adopted the update through **Check for app update**, retained all five synced receipt IDs and kept the queue clear. Tab-only offline emulation was restored and disabled after testing.

The existing availability monitor now checks **the website and database**, not only the database. [First website monitor](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/41369180983) and [post-update monitor](https://github.com/jhonny8765/agristore-pos-open-source/actions/runs/41370839599) passed. Existing failure-email routing was retained; no intentional failed-notification test or new paid service was started. GitHub scheduled execution can be delayed; independent missed-monitor detection remains a separate operating item.

## Before real store use

This new website origin still reported **persistent storage not granted** after requesting/checking protection. The previous Vercel installation and storage grant do not transfer to Pages. Choose the actual Magpet Windows PC/profile, install the app from the Pages address and recheck protection there. Do not clear the old website's data or reuse its shortcut as proof of a new-origin installation.

The actual elapsed 60-minute/eight-hour/Windows-restart tests remain postponed. Real opening inventory/costs, employee roles and independent counters, scale/printer, Supabase administrator/Auth/redirect configuration, actual project backup restore and the owner's pilot acceptance remain open. Use [Before Magpet accepts real sales](magpet-before-live.md). Passing this rehearsal does not guarantee prevention of theft, physical loss or unlimited free-plan capacity.
