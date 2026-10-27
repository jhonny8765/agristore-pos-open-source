import { test, expect, chromium, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Two revisions of the real production shell/Workbox manifest, served only on
// loopback. No hosted data, deployment aliases or source files are modified.
async function versionedApp() {
  let version = "one";
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405).end();
        return;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const upstream = await fetch(
        `http://127.0.0.1:3100${url.pathname}${url.search}`,
      );
      let body = Buffer.from(await upstream.arrayBuffer());
      if (url.pathname === "/sw.js") {
        const source = body.toString();
        const updated = source.replace(
          /(url:"\/",revision:")[^"]+("})/,
          `$1fixture-${version}$2`,
        );
        if (source === updated)
          throw new Error("Root precache revision fixture did not match.");
        body = Buffer.from(updated);
      } else if (url.pathname === "/") {
        body = Buffer.from(
          body
            .toString()
            .replace(
              "<head>",
              `<head><meta name="agristore-fixture-build" content="${version}">`,
            ),
        );
      }
      res.writeHead(upstream.status, {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "Service-Worker-Allowed": "/",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(500).end("Local upgrade fixture failed.");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Local upgrade server did not start.");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    publish: (next = "two") => {
      version = next;
    },
    close: async () => {
      const closed = new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      server.closeAllConnections();
      await closed;
    },
  };
}
async function openPractice(page: Page, origin: string) {
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Try practice checkout", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Grower feeds" }),
  ).toBeEnabled();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
}
function buildMarker(page: Page) {
  return page.locator('meta[name="agristore-fixture-build"]');
}
async function completedRecords(page: Page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("agristore-practice-v1");
        request.onerror = () =>
          reject(new Error("Could not read the local test database."));
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("sales", "readonly");
          const records = transaction.objectStore("sales").getAll();
          records.onsuccess = () =>
            resolve(
              records.result.map((record) => ({
                id: record.id,
                payload: record.payload,
              })),
            );
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => db.close();
        };
      }),
  );
}

test("a requested update reopens an uncontrolled window while another window keeps its cart", async ({
  page,
  context,
}) => {
  const app = await versionedApp();
  try {
    await openPractice(page, app.origin);
    // Without clients.claim(), the first window has no controllerchange event.
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller === null),
    ).toBe(true);
    const other = await context.newPage();
    await other.goto(app.origin);
    await other.getByRole("button", { name: "Add Grower feeds" }).click();
    await expect(other.locator(".receipt-heading")).toContainText("1 item");
    app.publish();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Check for app update", exact: true })
      .click();
    await expect(buildMarker(page)).toHaveAttribute("content", "two", {
      timeout: 25_000,
    });
    await expect(
      page.getByRole("heading", { name: "Checkout", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(app.origin + "/");
    await expect(buildMarker(other)).toHaveAttribute("content", "one");
    await expect(other.locator(".receipt-heading")).toContainText("1 item");
    await expect(
      other.getByLabel(/^Quantity \(.+\) for Grower feeds$/, { exact: true }),
    ).toHaveValue("1");
    await other.getByLabel("Cash received", { exact: true }).fill("2000");
    await other
      .getByRole("button", { name: "Complete cash sale", exact: true })
      .click();
    await expect(
      other.getByRole("heading", { name: "Sale saved.", exact: true }),
    ).toBeVisible();
    // This window's cached queue count predates the other window's sale.
    // Recheck IndexedDB before any further activation.
    app.publish("three");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page
      .getByRole("button", { name: "Check for app update", exact: true })
      .click();
    await expect(
      page.getByText(
        "Update ready. Finish checkout and confirm every pending record before reopening AgriStore.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(buildMarker(page)).toHaveAttribute("content", "two");
    await expect.poll(() => completedRecords(page)).toHaveLength(1);
    await page.reload();
    await page.getByRole("button", { name: /^Sync center/ }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test("a waiting update preserves the exact pending sale across offline browser-process restart", async () => {
  const app = await versionedApp();
  const directory = await mkdtemp(path.join(tmpdir(), "agri-upgrade-"));
  let context = await chromium.launchPersistentContext(directory, {
    headless: true,
  });
  try {
    let page = context.pages()[0];
    await openPractice(page, app.origin);
    // The previous scenario intentionally starts uncontrolled. Here the old
    // worker must control the window so the new revision actually waits.
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Add Grower feeds" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller !== null),
    ).toBe(true);
    await page.getByRole("button", { name: "Add Grower feeds" }).click();
    await page.getByLabel("Cash received", { exact: true }).fill("2000");
    await page
      .getByRole("button", { name: "Complete cash sale", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Sale saved.", exact: true }),
    ).toBeVisible();
    const before = await completedRecords(page);
    expect(before).toHaveLength(1);
    app.publish();
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration!.update();
    });
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Check for app update", exact: true }),
    ).toBeDisabled();
    await expect(buildMarker(page)).toHaveAttribute("content", "one");
    await context.close();
    context = await chromium.launchPersistentContext(directory, {
      headless: true,
    });
    await context.setOffline(true);
    page = context.pages()[0];
    await page.goto(app.origin);
    await expect(buildMarker(page)).toHaveAttribute("content", "two");
    await expect(
      page.getByRole("button", { name: "Add Grower feeds" }),
    ).toBeEnabled();
    expect(await completedRecords(page)).toEqual(before);
    await page.getByRole("button", { name: /^Sync center/ }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  } finally {
    await context.close();
    await app.close();
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !path.basename(resolved).startsWith("agri-upgrade-")
    )
      throw new Error("Refusing cleanup outside the created test profile.");
    await rm(resolved, { recursive: true, force: true });
  }
});


test("republishing an earlier shell revision preserves pending receipts across offline browser restart",async()=>{
 const app=await versionedApp(),directory=await mkdtemp(path.join(tmpdir(),"agri-rollback-"));
 let context=await chromium.launchPersistentContext(directory,{headless:true});
 try{
  let page=context.pages()[0];await openPractice(page,app.origin);app.publish("two");
  await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByRole("button",{name:"Check for app update",exact:true}).click();
  await expect(buildMarker(page)).toHaveAttribute("content","two",{timeout:25_000});
  await context.setOffline(true);
  for(let n=0;n<2;n++){await page.getByRole("button",{name:"Add Grower feeds"}).click();await page.getByLabel("Cash received",{exact:true}).fill("2000");await page.getByRole("button",{name:"Complete cash sale",exact:true}).click();await expect(page.getByRole("heading",{name:"Sale saved.",exact:true})).toBeVisible();}
  const before=await completedRecords(page);expect(before).toHaveLength(2);
  // This is a real Workbox/cache downgrade, using the current compatible JS
  // and IndexedDB schema. It does not certify arbitrary historical DB/code.
  app.publish("one");await context.setOffline(false);
  await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update();});
  await expect.poll(()=>page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await page.getByRole("button",{name:"Settings",exact:true}).click();await expect(page.getByRole("button",{name:"Check for app update",exact:true})).toBeDisabled();
  await expect(buildMarker(page)).toHaveAttribute("content","two");await context.close();
  context=await chromium.launchPersistentContext(directory,{headless:true});await context.setOffline(true);page=context.pages()[0];await page.goto(app.origin);
  await expect(buildMarker(page)).toHaveAttribute("content","one");await expect(page.getByRole("button",{name:"Add Grower feeds"})).toBeEnabled();expect(await completedRecords(page)).toEqual(before);
  await page.getByRole("button",{name:/^Sync center/}).click();await expect(page.locator("tbody tr")).toHaveCount(2);
 }finally{
  await context.close();await app.close();const resolved=path.resolve(directory);
  if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith("agri-rollback-"))throw new Error("Refusing cleanup outside the created rollback test profile.");
  await rm(resolved,{recursive:true,force:true});
 }
});
