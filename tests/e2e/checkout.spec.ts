import { test, expect, chromium, type Page } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
async function practice(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Try practice checkout" }).click();
  await expect(
    page.getByRole("heading", { name: "Checkout", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Grower feeds" }),
  ).toBeVisible();
}
async function buy(page: Page) {
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Complete cash sale" }).click();
  await expect(
    page.getByRole("heading", { name: "Sale saved." }),
  ).toBeVisible();
}
test("cash checkout stores a sale, distinct identical purchases, and change", async ({
  page,
}) => {
  await practice(page);
  await buy(page);
  await expect(page.getByText("₱420.00 change")).toBeVisible();
  await buy(page);
  await page.getByRole("button", { name: "Sales & receipts" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});
test("an aborted browser storage transaction shows no success, retains the basket and retries the same checkout ID",async({page})=>{
  await practice(page);
  await page.getByRole("button",{name:"Add Grower feeds"}).click();
  await page.getByLabel("Cash received",{exact:true}).fill("2000");
  // Inject a real IDB transaction abort after its add request succeeds, before
  // commit, in this disposable practice profile only. This is fault simulation,
  // not a claim that a physical Windows disk was filled or disconnected.
  await page.evaluate(()=>{
    const original=IDBObjectStore.prototype.add;
    const attempts:string[]=[];
    Object.assign(window,{storageFaultAttempts:attempts});
    IDBObjectStore.prototype.add=function(value,key){
      const request=original.call(this,value,key);
      if(this.name==="sales" && this.transaction.db.name==="agristore-practice-v1") {
        attempts.push((value as {id:string}).id);
        if(attempts.length===1) request.addEventListener("success",()=>this.transaction.abort(),{once:true});
      }
      return request;
    };
  });
  await page.getByRole("button",{name:"Complete cash sale"}).click();
  await expect(page.locator(".notice[role=alert]")).toContainText(/abort/i);
  await expect(page.getByRole("heading",{name:"Sale saved."})).toHaveCount(0);
  await expect(page.getByLabel("Cash received",{exact:true})).toHaveValue("2000");
  await expect(page.getByLabel(/^Quantity \(.+\) for Grower feeds$/)).toHaveValue("1");
  const readSales=()=>page.evaluate(()=>new Promise<{id:string}[]>((resolve,reject)=>{
    const request=indexedDB.open("agristore-practice-v1");
    request.onsuccess=()=>{const db=request.result;const tx=db.transaction("sales","readonly");const rows=tx.objectStore("sales").getAll();rows.onsuccess=()=>resolve(rows.result);tx.oncomplete=()=>db.close();tx.onerror=()=>reject(tx.error);};
    request.onerror=()=>reject(request.error);
  }));
  expect(await readSales()).toHaveLength(0);
  await page.getByRole("button",{name:"Complete cash sale"}).click();
  await expect(page.getByRole("heading",{name:"Sale saved."})).toBeVisible();
  const attempts=await page.evaluate(()=>(window as unknown as {storageFaultAttempts:string[]}).storageFaultAttempts);
  expect(attempts).toHaveLength(2);expect(attempts[0]).toBe(attempts[1]);
  expect((await readSales()).map(row=>row.id)).toEqual([attempts[0]]);
  await page.reload();
  await page.getByRole("button",{name:/^Sync center(?:\s+\d+)?$/}).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
});
test("checkout survives offline reload and does not send practice sales", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/rpc")) requests.push(r.url());
  });
  await practice(page);
  await page.waitForFunction(
    () =>
      !!navigator.serviceWorker.controller ||
      navigator.serviceWorker.ready.then(() => true),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add Grower feeds" }),
  ).toBeVisible();
  await context.setOffline(true);
  await buy(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add Grower feeds" }),
  ).toBeVisible();
  await expect(page.locator(".sidebar .store-logo")).toHaveJSProperty(
    "naturalWidth",
    192,
  );
  await page.getByRole("button", { name: "Sync center" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  expect(requests).toHaveLength(0);
});
test("expired authorization blocks a new sale and retains the old record", async ({
  page,
}) => {
  await practice(page);
  await buy(page);
  await page.clock.install();
  await page.clock.setSystemTime(Date.now() + 13 * 3600_000);
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
  await page.getByLabel("Cash received", { exact: true }).fill("2000");
  await page.getByRole("button", { name: "Complete cash sale" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText(
    "Offline authorization expired",
  );
  await page.getByRole("button", { name: "Sync center" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
});
test("a lot that expires while the basket is open cannot become a completed offline sale",async({page,context})=>{
  await page.clock.install({time:new Date('2026-10-25T15:59:00Z')});
  await practice(page);
  await page.evaluate(()=>new Promise<void>((resolve,reject)=>{
    const open=indexedDB.open('agristore-practice-v1');
    open.onsuccess=()=>{const d=open.result;const tx=d.transaction(['products','stocks'],'readwrite');const products=tx.objectStore('products');const request=products.get('10000000-0000-4000-8000-000000000100');request.onsuccess=()=>{
      const p=request.result;const batchId='10000000-0000-4000-8000-000000000800';
      products.put({...p,tracksExpiry:true,batches:[{id:batchId,lot:'TEST expires at Manila midnight',expiresOn:'2026-10-25'}]});
      tx.objectStore('stocks').put({key:p.id+':none',productId:p.id,batchId:null,quantity:'0'});
      tx.objectStore('stocks').put({key:p.id+':'+batchId,productId:p.id,batchId,quantity:'50'});
    };tx.oncomplete=()=>{d.close();resolve();};tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);
  }));
  await page.reload();
  await page.getByRole('button',{name:'Add Grower feeds'}).click();
  await page.getByLabel('Cash received',{exact:true}).fill('2000');
  await context.setOffline(true);
  await page.clock.setSystemTime(new Date('2026-10-25T16:00:01Z'));
  await page.getByRole('button',{name:'Complete cash sale',exact:true}).click();
  await expect(page.locator('.notice[role=alert]')).toContainText('lot has expired');
  await expect(page.getByRole('heading',{name:'Sale saved.',exact:true})).toHaveCount(0);
  await expect(page.locator('.receipt-item')).toHaveCount(1);
  await expect(page.getByLabel('Cash received',{exact:true})).toHaveValue('2000');
  await page.getByRole('button',{name:'Sync center',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(0);
});
test("pending checkout keeps manual app updates blocked across reload", async ({
  page,
}) => {
  await practice(page);
  await buy(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check for app update", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check for app update", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /^Sync center/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
});
test("quantity conversion and cash underpayment validation", async ({
  page,
}) => {
  await practice(page);
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
  await page
    .getByLabel("Unit for Grower feeds")
    .selectOption({ label: "Kilo" });
  await page.getByLabel(/^Quantity \(.+\) for Grower feeds$/).fill("2.5");
  await page.getByLabel("Cash received", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Complete cash sale" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText(
    "Cash received is below",
  );
  await page.getByLabel("Cash received", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Complete cash sale" }).click();
  await expect(
    page.getByRole("heading", { name: "Sale saved." }),
  ).toBeVisible();
});
test("real browser process restart retains the local outbox", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agri-browser-"));
  let context = await chromium.launchPersistentContext(directory, {
    headless: true,
  });
  try {
    let page = context.pages()[0];
    await page.goto("http://127.0.0.1:3100");
    await page.getByRole("button", { name: "Try practice checkout" }).click();
    await buy(page);
    await context.close();
    context = await chromium.launchPersistentContext(directory, {
      headless: true,
    });
    page = context.pages()[0];
    await page.goto("http://127.0.0.1:3100");
    await expect(
      page.getByRole("button", { name: "Add Grower feeds" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sync center" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  } finally {
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("desktop and mobile inspection captures with no horizontal page overflow", async ({
  page,
}) => {
  await mkdir(".impeccable/review", { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await practice(page);
  await page.screenshot({
    path: ".impeccable/review/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await page.locator(".product-art").first().boundingBox())?.height,
  ).toBeLessThanOrEqual(64);
  await expect(
    page.getByRole("heading", { name: "Checkout", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".impeccable/review/mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add Grower feeds" }).click();
  await expect(page.locator(".mobile-basket")).toContainText("1 item");
  await expect(page.locator(".mobile-basket")).toContainText("1,580.00");
  await page.getByRole("link", { name: "Review sale" }).click();
  await expect(page.locator("#current-sale .receipt-heading")).toBeInViewport();
  await page.getByRole("textbox", { name: "Search products" }).fill("sprayer");
  await expect(page.locator(".product")).toHaveCount(1);
  await page.getByRole("button", { name: "Reset search and filters" }).click();
  await expect(page.locator(".product")).toHaveCount(8);
});
test("200 browser checkouts persist through a simulated hour offline", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await practice(page);
  await page.waitForFunction(() =>
    navigator.serviceWorker.ready.then(() => true),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add Grower feeds" }),
  ).toBeVisible();
  await context.setOffline(true);
  for (let i = 0; i < 200; i++) await buy(page);
  await page.clock.install();
  await page.clock.setSystemTime(Date.now() + 3600_000);
  await page.reload();
  await page.getByRole("button", { name: "Sync center" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(200);
});


test("a cashier with 100000 retained receipts can reload, sell and export only unresolved records",async({page})=>{
  test.setTimeout(180_000);
  await practice(page); await buy(page);
  // Only this isolated test profile is seeded. This is capacity evidence, not
  // a claim that 100000 real server transactions or a year of hardware use ran.
  await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open("agristore-practice-v1"); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
    });
    try {
      const original=await new Promise<{id:string;payload:{transactionId:string;occurredAt:string};status:string}>((resolve,reject)=>{
        const tx=db.transaction('sales','readonly');const request=tx.objectStore('sales').openCursor();request.onsuccess=()=>resolve(request.result!.value);request.onerror=()=>reject(request.error);
      });
      const before=Date.now()-100_000_000;
      for(let offset=0;offset<100000;offset+=1000) await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction('sales','readwrite'); const store=tx.objectStore('sales');
        for(let n=offset;n<offset+1000;n++) {
          const id=n===0 ? original.id : `60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
          store.put({...original,id,status:'synced',payload:{...original.payload,transactionId:id,occurredAt:new Date(before+n*1000).toISOString()}});
        }
        tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    } finally {db.close();}
  });
  await page.reload();
  await expect(page.getByRole('button',{name:'Add Grower feeds'})).toBeEnabled();
  await buy(page);
  await page.getByRole('button',{name:'Sync center',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export recovery file',exact:true}).click();
  const download=await downloadPromise;
  const {readFile}=await import('node:fs/promises');
  const archive=JSON.parse(await readFile((await download.path())!,'utf8'));
  expect(archive.archive.totalRecords).toBe(1);
  expect(archive.sales).toHaveLength(1); expect(archive.sales[0].status).toBe('pending');
  await page.reload();
  await page.getByRole('button',{name:'Sync center',exact:true}).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  const count=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{
    const request=indexedDB.open('agristore-practice-v1');request.onsuccess=()=>{const db=request.result;const tx=db.transaction('sales','readonly');const count=tx.objectStore('sales').count();count.onsuccess=()=>resolve(count.result);tx.oncomplete=()=>db.close();tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);
  }));
  expect(count).toBe(100001);
});
