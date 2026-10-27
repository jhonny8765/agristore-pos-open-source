import {test,expect} from "@playwright/test";
import {readFile} from "node:fs/promises";

test("support downloads refresh scoped counts offline and leave original receipts unchanged",async({page,context})=>{
 await page.goto("/");await page.getByRole("button",{name:"Try practice checkout",exact:true}).click();
 await page.getByRole("button",{name:"Add Grower feeds"}).click();await page.getByLabel("Cash received",{exact:true}).fill("2000");await page.getByRole("button",{name:"Complete cash sale",exact:true}).click();await expect(page.getByRole("heading",{name:"Sale saved.",exact:true})).toBeVisible();
 await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open("agristore-practice-v1");open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction("sales","readwrite"),store=tx.objectStore("sales"),cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result!;row.update({...row.value,updatedAt:Date.now(),payload:{...row.value.payload,occurredAt:new Date(Date.now()-20*60_000).toISOString()}});};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 });
 await page.getByRole("button",{name:"Settings",exact:true}).click();const guide=page.getByRole("region",{name:"PC checks and store guide",exact:true});
 await expect(guide).toContainText("waited at least 15 minutes");
 // A second window's write after the displayed check must be included by the
 // export's fresh read, without changing or retrying either receipt.
 await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open("agristore-practice-v1");open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction("sales","readwrite"),store=tx.objectStore("sales"),cursor=store.openCursor();cursor.onsuccess=()=>{const row=cursor.result!.value,id="72000000-0000-4000-8000-000000000002";store.put({...row,id,payload:{...row.payload,transactionId:id}});const otherId="72000000-0000-4000-8000-000000000003";store.put({...row,id:otherId,error:"PRIVATE other business error",payload:{...row.payload,transactionId:otherId,organizationId:"72000000-0000-4000-8000-000000000099"}});};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{db.close();}
 });
 const records=()=>page.evaluate(()=>new Promise<unknown[]>((resolve,reject)=>{const open=indexedDB.open("agristore-practice-v1");open.onsuccess=()=>{const db=open.result,tx=db.transaction("sales","readonly"),rows=tx.objectStore("sales").getAll();rows.onsuccess=()=>resolve(rows.result);tx.oncomplete=()=>db.close();tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);}));
 const before=await records();await context.setOffline(true);await expect(guide).toContainText("Offline: continue only");
 const download=page.waitForEvent("download");await guide.getByRole("button",{name:"Download support report",exact:true}).click();const file=await download;
 expect(file.suggestedFilename()).toMatch(/^agristore-support-.*\.json$/);const raw=await readFile((await file.path())!,"utf8"),report=JSON.parse(raw);
 expect(report.format).toBe("agristore-support");expect(report.sales.pending).toBe(2);expect(report.otherUnresolvedRecords).toBe(1);expect(report.browserOnline).toBe(false);expect(report.mode).toBe("practice");expect(report.appRelease).toBeTruthy();
 expect(raw).not.toContain("PRIVATE");expect(raw).not.toContain("72000000-0000-4000-8000-000000000099");expect(raw).not.toContain('"payload"');expect(raw).not.toContain('"fingerprint"');
 const age=report.checks.find((check:{id:string})=>check.id==="queue-age");expect(age.state).toBe("Review");expect(age.detail).toContain("intentional outage");
 expect(await records()).toEqual(before);await expect(guide).toContainText("cannot confirm the file was saved");await expect(guide).toContainText("This health report cannot restore sales");await context.setOffline(false);
});
