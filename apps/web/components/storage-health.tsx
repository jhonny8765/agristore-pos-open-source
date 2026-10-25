"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "./ui/button";

export function StorageHealth() {
  const [status,setStatus] = useState("Checking this browser's storage…");
  const [busy,setBusy] = useState(false);
  const read = useCallback(async (request = false) => {
    setBusy(true);
    try {
      if (!navigator.storage) { setStatus("Storage health is unavailable. Complete the PC durability checks before real sales."); return; }
      const persistent = request && navigator.storage.persist ? await navigator.storage.persist() : await navigator.storage.persisted?.();
      const {usage,quota} = await navigator.storage.estimate();
      const percent = usage !== undefined && quota ? Math.round(usage/quota*100) : undefined;
      const low = usage !== undefined && quota !== undefined && (usage/quota >= 0.8 || quota-usage < 50*1024*1024);
      setStatus(`${persistent ? "Persistent storage granted." : "Persistent storage is not granted. This browser may remove local records under storage pressure."} ${percent === undefined ? "Usage estimate unavailable." : `${percent}% of the estimated browser quota is used.`} ${low ? "Space is low. Synchronize and export pending records; ask the owner to restore space without clearing this site's data." : "This estimate does not measure Windows free disk space or replace backups."}`);
    } catch { setStatus("Storage health could not be read. Pending records are retained; check the PC before real sales."); }
    finally { setBusy(false); }
  },[]);
  useEffect(() => { void read(); },[read]);
  return <div className="storage-health"><p role="status">{status}</p><Button variant="outline" disabled={busy} onClick={() => void read(true)}>Check storage protection</Button></div>;
}
