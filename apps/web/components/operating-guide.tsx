"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import type {PosDatabase} from "@agristore/offline";
import {operatingChecks,readOperatingStatus,type BrowserStorageStatus,type LocalOperatingStatus,type OperatingScope} from "../lib/operating-checks";
import {storeScenarios} from "../lib/store-scenarios";
import {Button} from "./ui/button";

export function OperatingGuide({db,scope,branchName,online,cached,practice,disabled,onRefreshCatalog,onSync}:{db:PosDatabase;scope:OperatingScope;branchName:string;online:boolean;cached:boolean;practice:boolean;disabled:boolean;onRefreshCatalog:()=>void;onSync:()=>void}){
 const [local,setLocal]=useState<LocalOperatingStatus>();const [storage,setStorage]=useState<BrowserStorageStatus>({});
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [now,setNow]=useState(0);const [checkedAt,setCheckedAt]=useState(0);const generation=useRef(0);
 const {organizationId,branchId,actorId,role}=scope;
 const invalidate=useCallback(()=>{generation.current++;},[]);
 const read=useCallback(async()=>{
  const request=++generation.current;setBusy(true);
  const [records,space]=await Promise.allSettled([readOperatingStatus(db,{organizationId,branchId,actorId,role}),(async()=>{if(!navigator.storage)return {};const [persistent,estimate]=await Promise.all([navigator.storage.persisted?.(),navigator.storage.estimate()]);return {persistent,...estimate};})()]);
  if(request!==generation.current)return;
  if(records.status==="fulfilled"){setLocal(records.value);setError("");}else{setLocal(undefined);setError("Local records could not be checked. Do not begin checkout until this is resolved. Keep this profile and site data, preserve recovery evidence and ask the maintainer for help.");}
  setStorage(space.status==="fulfilled"?space.value:{});const time=Date.now();setNow(time);setCheckedAt(time);setBusy(false);
 },[db,organizationId,branchId,actorId,role]);
 useEffect(()=>{void read();const timer=setInterval(()=>setNow(Date.now()),15_000);const focus=()=>void read();window.addEventListener("focus",focus);return()=>{invalidate();clearInterval(timer);window.removeEventListener("focus",focus);};},[read,online,invalidate]);
 const checks=local?operatingChecks({scope,local,storage,online,cached,practice,now}):[];
 return <section className="panel operating-guide" aria-label="PC checks and store guide">
  <div className="section-heading"><h2>PC checks & store guide</h2><Button variant="outline" disabled={busy||disabled} onClick={()=>void read()}>Refresh PC checks</Button></div>
  <p>{branchName} · This browser and your permitted account view. These are operating checks, not permission to launch real sales. Physical stock, scales/printer, individual staff, real backups and the one-branch pilot still require evidence.</p>
  {busy&&<p role="status">Checking saved records and browser storage…</p>}{error&&<p role="alert" className="notice error">{error}</p>}
  {checkedAt>0&&<p>Checked {new Date(checkedAt).toLocaleString("en-PH",{timeZone:"Asia/Manila"})} · Asia/Manila. Refresh after another window saves or synchronizes. Authorization time continues counting down.</p>}
  <dl className="operating-checks">{checks.map(c=><div key={c.id}><dt>{c.title} · <strong>{c.state}</strong></dt><dd>{c.detail}</dd></div>)}</dl>
  <div className="operating-actions"><Button variant="outline" disabled={disabled||!online||practice} onClick={onRefreshCatalog}>Refresh stock & catalog</Button><Button variant="outline" disabled={disabled} onClick={onSync}>Open Sync center</Button></div>
  <h3>Before the first real sale</h3>
  <ol><li>Choose the Windows cashier PC and normal Edge profile. Pass storage protection, a real 60-minute outage, eight-hour test and Windows restart using labelled TEST sales.</li><li>Check the scale/tare and printed receipt. Independently verify opening stock, pack conversions, lots/expiry and actual purchase costs.</li><li>Use separate staff accounts, two independent counters and a separate approving owner. Restore a real production backup into an isolated working environment.</li><li>Pilot one branch with daily signed cash and stock reconciliation. Expand only after the owner accepts the evidence. This screen cannot certify these steps.</li></ol>
  <h3>What to do when something happens</h3>
  <p>Open the situation below. These instructions remain available with the cached app; online actions still need connectivity and their usual permissions.</p>
  {storeScenarios.map(s=><details key={s.id}><summary>{s.title}</summary><ol>{s.steps.map(step=><li key={step}>{step}</li>)}</ol></details>)}
 </section>;
}
