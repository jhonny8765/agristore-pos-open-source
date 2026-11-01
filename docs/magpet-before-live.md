# Before Magpet accepts real sales

Keep using **Practice mode** and the test business until these steps are signed off. Passing software tests does not check the real store's starting stock, physical scale, receipt printer or PC.

## 1. Recover administrator access and secure accounts

Sign in to the Supabase dashboard, then confirm **team kaingin** and project **vbmnnouwmxcuibywdkjw**. The Supabase dashboard account is different from a POS cashier account. Do not send a password, recovery code or database connection secret in chat.

Once access is available, the maintainer can verify free Auth settings: at least a 12-character minimum, appropriate password requirements, real email-confirmation/invitation delivery and the selected live URL/redirects. These settings have not yet been changed by this follow-up. The built-in breached-password checker is a paid Supabase feature and remains off.

Change any old/shared/test passwords privately. Use unique passwords and protect the GitHub, hosting and database administrator accounts with their available two-factor authentication. Keep recovery codes privately. Do not make another staff member an administrator just to share a login.

Create and verify individual staff accounts, then assign only their real roles. A blind count needs two different counters and an owner who entered neither count. After initial staff onboarding, disable open public signup on the live project and use a controlled invitation process for later staff. Verify the invitation process before disabling the route staff still need. Do not broaden branch permissions to make a sign-in succeed.

## 2. Choose the live hosting and backup setup

The current website is on Vercel Hobby, which is restricted to personal, non-commercial use. Choose hosting that permits the intended business use before Magpet goes live. Calling an address "staging" does not determine its eligibility. No purchase or upgrade has been made. A no-payment alternative needs its own account access, compatibility/limit checks and the complete cashier/offline test gate before cutover; changing the address alone is not sufficient.

Choose a place for encrypted database backups outside the cashier PC, who runs/checks them, how often they run and how much recent work the store can afford to re-enter after an incident. Then restore an **actual live-project backup** into an isolated test environment and check sales, cash, stock and access. The passing disposable test restore does not prove this has happened. Browser recovery JSON protects unresolved sales; it is not a complete database backup. Keep encryption keys separately and private.

Assign someone to check hosting/database usage and account notices at least weekly during the pilot. Free services have limits and pause/restriction rules; the capacity test is not a certificate that a free plan can run indefinitely. Keep all business history while planning capacity changes.

Confirm failure alerts reach the maintainer. The current monitor checks the database only. Before live use, also test that the selected website and its database health check are covered; a database-only success does not prove the cashier website opens.

At any domain change, synchronize/export every unresolved record first. Browser storage belongs to each website origin. Do not clear the old profile or assume its pending records automatically move to the new address. The maintainer must verify the cutover and recovery process.

## 3. Supply real products and opening stock

Choose a clean live dataset and starting date; staging contains TEST transactions. Preserve historical test evidence separately instead of deleting or rewriting completed records to make totals look clean.

Provide real product names/SKUs, selling prices, purchase costs, each sack/bottle/roll conversion, permitted loose units, lot numbers and expiry dates. Count actual Magpet stock with an independent checker, sign the opening list and verify the import against it. Missing cost must remain visibly unvalued. Confirm there is only **Magpet Branch**, with no customer-facing branch-add or rename control.

## 4. Reserve the actual cashier PC

Choose the Windows PC and browser profile, install/open the PWA, verify protected storage and keep site data. Finish the postponed real 60-minute offline and eight-hour endurance checks, including an authorized normal Windows restart. Save other work first. No restart is performed without your agreement.

Use a protected Windows login and screen lock. Use an ordinary dedicated browser profile, not guest/private browsing; check that exit/cleanup settings do not erase this site's data. Keep any existing device-encryption recovery key private and recoverable before changing disk security. The application does not encrypt a stolen or unlocked Windows session by itself.

Every completed test sale must survive and synchronize once. Recheck the original IDs, payments, stock movements and recovery-file replay. A simulated clock change or a short automated run does not complete this step. Follow [the endurance record sheet](endurance-test-record.md).

## 5. Rehearse with real staff and equipment

Check the scale's zero/tare and actual quarter-kilo, half-kilo, gram and peso-budget requests. Confirm that measured liquid and rope quantities match the physical measuring tools, and sealed pieces stay whole. Print and inspect a real sample receipt; the pilot does not issue official tax invoices.

Rehearse receiving/rejected deliveries, untouched-delivery corrections, damaged/held goods, partial refunds and corrections, two-person blind counts and separate-owner approval. Use test data for this rehearsal. Confirm each employee understands who may approve a cash/stock correction and how to report an unresolved investigation.

## 6. Run one controlled branch pilot

Record opening cash and stock, then reconcile counted cash against the shift and high-risk stock against the movement ledger every day. Check unresolved sales, stock investigations, expiry reminders, refund activity, backup completion and failure alerts. Never enter a second sale or delivery merely because the first response was uncertain; recover its original ID.

If cash/stock does not reconcile, preserve the evidence, stop the affected workflow and ask the owner/maintainer to investigate. A sale report is not proof that no physical goods are missing. Expand only after Magpet's real pilot is accepted; the other branches remain inactive historical references.
