import type { DiscoveredService, DiscoverySource, SourceEvent } from "../../../shared/types";
import { instanceKey } from "../identity";

export class FakeSource implements DiscoverySource {
  started = false;
  startCalls = 0;
  stopCalls = 0;
  updateCalls = 0;
  expireCalls = 0;
  private listeners = new Set<(event: SourceEvent) => void>();

  start(): void {
    this.started = true;
    this.startCalls++;
  }
  stop(): void {
    this.started = false;
    this.stopCalls++;
  }
  update(): void {
    this.updateCalls++;
  }
  expire(): void {
    this.expireCalls++;
  }
  subscribe(listener: (event: SourceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // test/dev hook
  emit(event: SourceEvent): void {
    for (const l of [...this.listeners]) l(event);
  }
}

export function makeService(
  partial: Partial<DiscoveredService> & { name: string; serviceType: string; hostname: string },
): DiscoveredService {
  const protocol = partial.serviceType.endsWith("._udp") ? "udp" : "tcp";
  const fqdn = `${partial.name}.${partial.serviceType}.local.`;
  return {
    key: instanceKey(fqdn),
    name: partial.name,
    serviceType: partial.serviceType,
    protocol,
    port: partial.port ?? 80,
    hostname: partial.hostname,
    addresses: partial.addresses ?? [],
    txt: partial.txt ?? {},
    rawTxt: partial.rawTxt,
    ttl: partial.ttl ?? 4500,
  };
}
