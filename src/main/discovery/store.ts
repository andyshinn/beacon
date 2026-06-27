import type {
  Address,
  DiscoveredService,
  DiscoveryDelta,
  DiscoverySnapshot,
  Host,
  Instance,
} from '../../shared/types'
import { classifyAddress } from './classify'
import { cleanHostname, hostId } from './identity'

export class DiscoveryStore {
  private hosts = new Map<string, Host>()
  private instances = new Map<string, Instance>()

  upsert(service: DiscoveredService, now: number): DiscoveryDelta {
    const hid = hostId(service.hostname)
    const addrs = service.addresses.map(classifyAddress)

    const prev = this.instances.get(service.key)
    const instance: Instance = {
      key: service.key,
      name: service.name,
      serviceType: service.serviceType,
      protocol: service.protocol,
      port: service.port,
      txt: service.txt,
      rawTxt: service.rawTxt,
      hostId: hid,
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
      present: true,
      departedAt: undefined,
    }
    this.instances.set(instance.key, instance)

    const host = this.upsertHost(hid, service.hostname, addrs, now)
    return { upsertInstances: [instance], upsertHosts: [host] }
  }

  snapshot(): DiscoverySnapshot {
    return { hosts: [...this.hosts.values()], instances: [...this.instances.values()] }
  }

  private upsertHost(hid: string, hostname: string, newAddrs: Address[], now: number): Host {
    const prev = this.hosts.get(hid)
    const merged = unionAddresses(prev?.addresses ?? [], newAddrs)
    const host: Host = {
      id: hid,
      displayName: cleanHostname(hostname),
      hostname,
      addresses: merged,
      firstSeen: prev?.firstSeen ?? now,
      lastSeen: now,
      present: true,
      departedAt: undefined,
    }
    this.hosts.set(hid, host)
    return host
  }
}

function addrId(a: Address): string {
  return `${a.family}:${a.value}:${a.zone ?? ''}`
}

function unionAddresses(a: Address[], b: Address[]): Address[] {
  const out: Address[] = []
  const seen = new Set<string>()
  for (const addr of [...a, ...b]) {
    const id = addrId(addr)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(addr)
  }
  return out
}
