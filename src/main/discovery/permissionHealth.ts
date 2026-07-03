// Darwin-only advisory check for the macOS Local Network TCC permission. The permission
// fails SILENTLY (mDNS sends yield no responses) and is not reliably catchable as a socket
// error through bonjour-service/multicast-dns, so we use the spec-sanctioned heuristic:
// if no instance responses arrive within a few seconds of going live, warn the user once.
// See GC-5. Timers are injectable for fake-timer tests.
type Timer = ReturnType<typeof setTimeout>;

export interface HealthCheck {
  arm(onWarn: () => void): void;
  noteActivity(): void;
  cancel(): void;
}

export interface LocalNetworkHealthOptions {
  enabled: boolean;
  timeoutMs?: number;
  setTimer?: (cb: () => void, ms: number) => Timer;
  clearTimer?: (handle: Timer) => void;
}

export class LocalNetworkHealthCheck implements HealthCheck {
  private readonly enabled: boolean;
  private readonly timeoutMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => Timer;
  private readonly clearTimer: (handle: Timer) => void;
  private timer?: Timer;
  private resolved = false; // latched once activity is seen OR a warning has fired

  constructor(options: LocalNetworkHealthOptions) {
    this.enabled = options.enabled;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  arm(onWarn: () => void): void {
    if (!this.enabled || this.resolved || this.timer !== undefined) return;
    this.timer = this.setTimer(() => {
      this.timer = undefined;
      if (this.resolved) return;
      this.resolved = true;
      onWarn();
    }, this.timeoutMs);
  }

  noteActivity(): void {
    this.resolved = true;
    this.stopTimer();
  }

  cancel(): void {
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      this.clearTimer(this.timer);
      this.timer = undefined;
    }
  }
}
