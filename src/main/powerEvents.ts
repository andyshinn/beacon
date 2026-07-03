export interface PowerMonitorLike {
  on(event: "resume", listener: () => void): void;
  off(event: "resume", listener: () => void): void;
}

export interface PowerEventsDeps {
  powerMonitor: PowerMonitorLike;
  isLive: () => boolean;
  restart: () => void;
  settleMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

// On wake from sleep the network (and the sockets' bound interface) often changed,
// so a live discovery session must rebind its sockets. We wait a short settle delay
// after `resume` to let the OS bring the interface back up before restarting, and
// debounce repeated resume events into one restart.
export function installPowerEvents(deps: PowerEventsDeps): () => void {
  const settleMs = deps.settleMs ?? 2000;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const onResume = (): void => {
    if (!deps.isLive()) return;
    if (pending !== undefined) clearTimer(pending);
    pending = setTimer(() => {
      pending = undefined;
      if (deps.isLive()) deps.restart();
    }, settleMs);
  };

  deps.powerMonitor.on("resume", onResume);

  return () => {
    deps.powerMonitor.off("resume", onResume);
    if (pending !== undefined) {
      clearTimer(pending);
      pending = undefined;
    }
  };
}
