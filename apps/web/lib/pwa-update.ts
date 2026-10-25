export async function findReadyUpdate(
  registration: ServiceWorkerRegistration,
  timeoutMs = 30_000,
): Promise<ServiceWorker | null> {
  await registration.update();
  const worker = registration.installing;
  if (!worker) return registration.waiting;
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, ready: ServiceWorker | null = null) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve(ready);
    };
    const changed = () => {
      if (worker.state === "installed") finish(undefined, worker);
      else if (worker.state === "activated") finish(undefined, worker);
      else if (worker.state === "redundant")
        finish(
          new Error(
            "The update could not be installed. Your current app is still available; try again online.",
          ),
        );
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "The update is still downloading. Keep using the current app and check again later.",
          ),
        ),
      timeoutMs,
    );
    worker.addEventListener("statechange", changed);
    changed();
  });
}

/** Restart only the requesting window, after activation and a fresh safety check.
 * Other windows are not claimed or reloaded by this operation. */
export async function activateReadyUpdate(
  worker: ServiceWorker,
  canRestart: () => Promise<boolean>,
  restart: () => void,
  timeoutMs = 15_000,
): Promise<"blocked" | "restarting"> {
  if (!(await canRestart())) return "blocked";
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve();
    };
    const changed = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant")
        finish(
          new Error(
            "The update could not finish installing. Keep using the app and check again online.",
          ),
        );
    };
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "The update has not finished installing. Keep this window open and check again online. Your saved records remain on this PC.",
          ),
        ),
      timeoutMs,
    );
    worker.addEventListener("statechange", changed);
    if (worker.state === "installed") {
      try {
        worker.postMessage({ type: "SKIP_WAITING" });
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error(
                "Could not install the app update. Check again online.",
              ),
        );
      }
    }
    changed();
  });
  if (!(await canRestart())) return "blocked";
  restart();
  return "restarting";
}
