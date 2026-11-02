export interface StorageProbe {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
}

export interface StorageReading {
  persistent?: boolean;
  usage?: number;
  quota?: number;
  requestFailed: boolean;
}

// Permission and quota are independent. A quota failure must not hide a real
// grant; a failed request must not masquerade as an explicit denial.
export async function readBrowserStorage(storage?: StorageProbe, request = false): Promise<StorageReading> {
  let requestFailed = false;
  if (request && storage?.persist) {
    try { await storage.persist(); } catch { requestFailed = true; }
  }
  const [permission, estimate] = await Promise.allSettled([
    (async () => storage?.persisted?.())(), (async () => storage?.estimate?.())(),
  ]);
  const persistent = permission.status === "fulfilled" && typeof permission.value === "boolean"
    ? permission.value : undefined;
  const raw = estimate.status === "fulfilled" ? estimate.value : undefined;
  const usage = typeof raw?.usage === "number" && Number.isFinite(raw.usage) && raw.usage >= 0 ? raw.usage : undefined;
  const quota = typeof raw?.quota === "number" && Number.isFinite(raw.quota) && raw.quota > 0 ? raw.quota : undefined;
  return { persistent, usage, quota, requestFailed };
}

export function storageDescription(reading: StorageReading): string {
  const { persistent, usage, quota, requestFailed } = reading;
  const permission = persistent === true ? "Persistent storage granted."
    : persistent === false ? "Persistent storage is not granted. This browser may remove local records under storage pressure."
    : "Storage protection could not be verified. Do not assume offline records are protected.";
  const known = usage !== undefined && quota !== undefined;
  const space = known ? `${Math.round(usage / quota * 100)}% of the estimated browser quota is used.` : "Usage estimate unavailable.";
  const low = known && (usage / quota >= 0.8 || quota - usage < 50 * 1024 * 1024);
  return [permission, requestFailed ? "The protection request failed; the status above is a separate check." : "", space,
    low ? "Space is low. Synchronize and export pending records; restore space without clearing this site's data."
      : "This estimate does not measure Windows free disk space or replace backups."].filter(Boolean).join(" ");
}
