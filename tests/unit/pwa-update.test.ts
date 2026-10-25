import { afterEach, expect, it, vi } from "vitest";
import {
  activateReadyUpdate,
  findReadyUpdate,
} from "../../apps/web/lib/pwa-update";

class Worker extends EventTarget {
  state: ServiceWorkerState = "installing";
  postMessage = vi.fn();
  transition(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}
function registration(worker: Worker | null) {
  return {
    update: vi.fn(async () => {}),
    installing: worker,
    waiting: null,
  } as unknown as ServiceWorkerRegistration;
}
afterEach(() => vi.useRealTimers());
it("waits for downloading worker installation instead of reporting up to date", async () => {
  const worker = new Worker();
  const r = registration(worker);
  let settled = false;
  const result = findReadyUpdate(r).then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  worker.transition("installed");
  expect(await result).toBe(worker);
});
it("waits for the newer installer when an older download is already waiting", async () => {
  const old = new Worker();
  old.state = "installed";
  const next = new Worker();
  const r = {
    ...registration(next),
    waiting: old,
  } as unknown as ServiceWorkerRegistration;
  let settled = false;
  const result = findReadyUpdate(r).then((value) => {
    settled = true;
    return value;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  next.transition("installed");
  expect(await result).toBe(next);
});

function waitingWorker() {
  const worker = new Worker();
  worker.state = "installed";
  return worker;
}
it("restarts once after activation without relying on a controller-change event", async () => {
  const worker = waitingWorker();
  const restart = vi.fn();
  const guard = vi.fn(async () => true);
  const result = activateReadyUpdate(
    worker as unknown as ServiceWorker,
    guard,
    restart,
  );
  await Promise.resolve();
  expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  worker.transition("activating");
  expect(restart).not.toHaveBeenCalled();
  worker.transition("activated");
  expect(await result).toBe("restarting");
  worker.transition("activated");
  expect(restart).toHaveBeenCalledTimes(1);
  expect(guard).toHaveBeenCalledTimes(2);
});
it("does not activate while checkout or pending records block restart", async () => {
  const worker = waitingWorker();
  const restart = vi.fn();
  expect(
    await activateReadyUpdate(
      worker as unknown as ServiceWorker,
      async () => false,
      restart,
    ),
  ).toBe("blocked");
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(restart).not.toHaveBeenCalled();
});
it("checks again after activation and retains newly pending work", async () => {
  const worker = waitingWorker();
  const restart = vi.fn();
  const guard = vi
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const result = activateReadyUpdate(
    worker as unknown as ServiceWorker,
    guard,
    restart,
  );
  await Promise.resolve();
  worker.transition("activated");
  expect(await result).toBe("blocked");
  expect(restart).not.toHaveBeenCalled();
});
it("handles an already activated worker without posting another activation", async () => {
  const worker = waitingWorker();
  worker.state = "activated";
  const restart = vi.fn();
  expect(
    await activateReadyUpdate(
      worker as unknown as ServiceWorker,
      async () => true,
      restart,
    ),
  ).toBe("restarting");
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(restart).toHaveBeenCalledTimes(1);
});
it("rejects a failed activation without leaving an automatic restart behind", async () => {
  const worker = waitingWorker();
  const restart = vi.fn();
  const result = activateReadyUpdate(
    worker as unknown as ServiceWorker,
    async () => true,
    restart,
  );
  const assertion = expect(result).rejects.toThrow(
    "could not finish installing",
  );
  await Promise.resolve();
  worker.transition("redundant");
  await assertion;
  worker.transition("activated");
  expect(restart).not.toHaveBeenCalled();
});
it("times out activation and removes its listener so a late update cannot restart checkout", async () => {
  vi.useFakeTimers();
  const worker = waitingWorker();
  const removed = vi.spyOn(worker, "removeEventListener");
  const restart = vi.fn();
  const result = activateReadyUpdate(
    worker as unknown as ServiceWorker,
    async () => true,
    restart,
    50,
  );
  const assertion = expect(result).rejects.toThrow("not finished installing");
  await vi.advanceTimersByTimeAsync(51);
  await assertion;
  expect(removed).toHaveBeenCalledWith("statechange", expect.any(Function));
  worker.transition("activated");
  expect(restart).not.toHaveBeenCalled();
});
it("cleans up when the browser rejects the activation message", async () => {
  const worker = waitingWorker();
  worker.postMessage.mockImplementation(() => {
    throw new Error("Browser closed");
  });
  const restart = vi.fn();
  await expect(
    activateReadyUpdate(
      worker as unknown as ServiceWorker,
      async () => true,
      restart,
    ),
  ).rejects.toThrow("Browser closed");
  worker.transition("activated");
  expect(restart).not.toHaveBeenCalled();
});
it("returns the already waiting worker", async () => {
  const worker = new Worker();
  const r = {
    ...registration(null),
    waiting: worker,
  } as unknown as ServiceWorkerRegistration;
  expect(await findReadyUpdate(r)).toBe(worker);
});
it("reports no new update only when neither waiting nor installing exists", async () => {
  expect(await findReadyUpdate(registration(null))).toBeNull();
});
it("keeps an installation failure visible", async () => {
  const worker = new Worker();
  const result = findReadyUpdate(registration(worker));
  const assertion = expect(result).rejects.toThrow(
    "current app is still available",
  );
  await Promise.resolve();
  worker.transition("redundant");
  await assertion;
});
it("bounds a stalled download without activating or removing the current app", async () => {
  vi.useFakeTimers();
  const result = findReadyUpdate(registration(new Worker()), 50);
  const assertion = expect(result).rejects.toThrow("still downloading");
  await vi.advanceTimersByTimeAsync(51);
  await assertion;
});
