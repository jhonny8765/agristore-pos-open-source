# Free hosting for Magpet

This release supports Cloudflare Pages Free for the cash-only POS. It exports the existing Next.js application shell and keeps all authorized sales, cash and stock operations in Supabase. A small Pages Worker implements the live `/api/health` check. This is a hosting change, not a second stock database.

## Accounts

1. The maintainer creates a **Cloudflare Free account** at <https://dash.cloudflare.com/sign-up>, verifies their email and enables two-factor authentication. Keep account recovery codes privately. No domain purchase, card or paid Workers plan is needed for this setup.
2. Keep the existing **GitHub account** for source, free public test runners and failure notifications. No additional repository access grant is needed for a ZIP upload.
3. Recover access to the **existing Supabase dashboard account**. Verify the intended organization/project before changing Auth settings. A cashier's POS email is not proof of dashboard ownership. Do not create a replacement database merely because the dashboard password was forgotten.
4. Each real employee still needs their own **POS login and assigned role**. The owner, independent counters and cashier must not share credentials.

## What gets uploaded

`npm run build:cloudflare` requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the build process. Only a modern publishable key or a legacy anon key is accepted; secret/service-role keys are rejected. Variables are deliberately supplied to the process rather than copied from a deployment `.env` file. The build runs in a separate temporary app copy, leaving the original API route and normal Vercel build intact.

The output is `cloudflare-output/agristore-pos-cloudflare.zip`. Its root contains the exported pages, local assets, offline service worker, `_worker.js`, `_routes.json` and `_headers`. The accompanying `build-report.json` records release identity, ZIP SHA-256 and whether the backend was configured. No local IndexedDB records, business rows, recovery JSON, source files, environment files or private API keys belong in this upload.

An explicit `npm run build:cloudflare -- --practice` creates an unconnected rehearsal. Its health endpoint must return 503; it must never be mistaken for a connected release. Run `npm run preview:cloudflare` **after** building. Stop the preview before rebuilding. Preview starts from the generated directory with an empty credential file and does not load the repository's deployment credentials.

## Upload the connected build

If the project already exists, open it under Workers & Pages and choose **Create deployment**, or continue the upload page already open. Do not create a second project just to upload the ZIP. For this Magpet setup, the prepared project is **better-yield-magpet-pos**.

1. Sign in to Cloudflare and open **Compute → Workers & Pages → Create application**.
2. Choose **Continue to Pages**. If Cloudflare calls this the legacy workflow, choose that Pages option for this prepared artifact; the separate Workers static-upload wizard is a different deployment path.
3. Choose **Drag and drop your files → Get started**.
4. Enter the agreed project name and choose **Create project**.
5. Choose **file**, select only the generated ZIP, and check that its assets finish uploading. Do not upload the repository, an `.env` file or a recovery JSON.
6. Choose **Deploy site**. Wait for success, then open its permanent `https://…pages.dev` address.
7. Check `/api/health`: it must return HTTP 200 with `service: agristore-pos`, `status: ok` and a current `checkedAt`. An HTML sign-in/protection page, stale JSON or frozen healthy file is not a passing check.
8. Verify sign-in, permitted Magpet access, local practice cash/weight flows, installability and offline reload. Review the completed automated platform gate before designating the address for store use.

For later releases, run **GitHub → Actions → Verify Cloudflare hosting → Run workflow** against the exact source being uploaded. See [the completed hosting verification](cloudflare-verification.md) for this release's results and remaining launch gates.

Dashboard ZIP uploads support this advanced-mode Worker. `/api/health` and three explicit denials for deployment control files invoke it; ordinary pages/assets bypass Functions. The denials return 404 consistently even where the local asset emulator mishandles those reserved filenames. Static security headers come from `_headers`, and the Worker separately applies the same policy. The Worker uses manual redirects, which Cloudflare supports, and rejects redirected/unavailable backend responses without following them. Health responses are never cached.

## Moving the cashier safely

A different website address has separate browser storage. Before the cashier changes address, synchronize all pending sales and owner requests, close the shift online and export a recovery file. Confirm the old Sync center has no unresolved records. Keep the old profile and site data until the maintainer verifies every original transaction; do not uninstall/clear storage to make the warning disappear.

Sign in and register/authorize the cashier at the new address while online, download the catalog and open a shift. Verify the protected-storage status again on that origin. Install the PWA from the new address. Never assume an installation or storage grant for the Vercel address automatically applies to Pages.

The maintainer must also set the exact live URL/allowed invitation and password-reset redirects in Supabase, test actual staff access, and point the availability monitor at the verified website. Preserve a known working ZIP and deployment identity for rollback. A rollback changes the shell; it must never delete cashier storage or rewrite completed transactions.

## Cost and operating limits

Cloudflare's reviewed terms do not impose a personal-only restriction on this use. Its Free Services terms prohibit collecting/processing credit-card information; this release accepts cash and does not handle card details. Static Pages requests are free/unlimited. The health Worker shares the Free Workers quota of 100,000 requests per day with other Workers on the account. No paid service is activated by this build.

Supabase remains separately limited: its published Free plan includes a 500 MB database and 5 GB egress, and inactive projects may be paused. Keep usage/account notices under weekly review, preserve business history and plan capacity before reaching a limit. Free services do not guarantee uninterrupted service or indefinite capacity. The existing large-fixture tests do not certify that the same fixture fits the Free database allowance.

This hosting work does not complete the actual cashier PC's real elapsed outage/eight-hour/Windows-restart tests, independently checked opening stock, role onboarding, printer/scale checks, actual project backup-and-restore, or owner pilot sign-off. Use [Before Magpet accepts real sales](magpet-before-live.md).

Sources checked November 2, 2026: [Cloudflare terms](https://www.cloudflare.com/terms/), [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [direct upload and Worker support](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Workers Request redirect behavior](https://developers.cloudflare.com/workers/runtime-apis/request/), [Supabase plans](https://supabase.com/pricing).
