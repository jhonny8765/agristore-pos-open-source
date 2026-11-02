"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { readBrowserStorage, storageDescription, type StorageReading } from "../lib/browser-storage";

export function StorageHealth({ appInstall, appName = "AgriStore" }: { appInstall: { available: boolean; message: string; install: () => Promise<void> }; appName?: string }) {
  const [reading,setReading] = useState<StorageReading>();
  const [host,setHost] = useState("");
  const [busy,setBusy] = useState(false);
  const inFlight = useRef(false);
  const read = useCallback(async (request = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      setReading(await readBrowserStorage(navigator.storage, request));
    } finally { inFlight.current = false; setBusy(false); }
  },[]);
  useEffect(() => {
    setHost(window.location.hostname);
    void read();
    const refresh = () => { void read(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("appinstalled", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("appinstalled", refresh);
    };
  },[read]);
  return <div className="storage-health" role="region" aria-label="Browser storage protection">
    <p role="status">{reading ? storageDescription(reading) : "Checking this browser's storage…"}</p>
    <Button variant="outline" disabled={busy} onClick={() => void read(true)}>{busy ? "Checking storage…" : "Check storage protection"}</Button>
    {appInstall.available && <Button variant="outline" onClick={() => void appInstall.install()}>Install {appName} on this PC</Button>}
    {appInstall.message && <p role="status">{appInstall.message}</p>}
    <p className="muted">This check applies only to {host || "this website"} in this browser profile. An app installed from the old website does not protect this website’s records.</p>
    {reading?.persistent !== true && <ol>
      <li>Use a normal, dedicated browser profile. Install this website using the install icon beside the address or the browser’s app menu.</li>
      <li>Open that installed app, return to Settings and select Check storage protection. The browser decides whether to grant it.</li>
      <li>If protection is still not granted or cannot be verified, keep pending records, synchronize and export a recovery file. Contact your service provider before real sales; this PC has not passed the offline launch gate.</li>
    </ol>}
    <p className="muted">Keep this profile and site data. Never clear browsing data to fix storage. Even protected records can be lost if site data is manually deleted or the drive fails.</p>
  </div>;
}
