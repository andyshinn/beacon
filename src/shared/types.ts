// Address classification
export type AddrFamily = 'ipv4' | 'ipv6' | 'linklocal' | 'loopback'

export interface Address {
  value: string // ip without zone, e.g. "fe80::1"
  family: AddrFamily
  zone?: string // interface scope for link-local IPv6, e.g. "en0"
}

export interface RawTxtEntry {
  key: string
  value: string | null // null = boolean/no-value key
}

// Canonical model (owned by main, mirrored in renderer in later plans)
export interface Host {
  id: string // lowercased hostname, e.g. "andy-mac-studio.local."
  displayName: string
  hostname: string // "Andy-Mac-Studio.local."
  addresses: Address[]
  firstSeen: number
  lastSeen: number
  present: boolean
  departedAt?: number
}

export interface Instance {
  key: string // lowercased fqdn "name._airplay._tcp.local."
  name: string
  serviceType: string // "_airplay._tcp"
  protocol: 'tcp' | 'udp'
  port: number
  txt: Record<string, string>
  rawTxt?: RawTxtEntry[]
  hostId: string
  firstSeen: number
  lastSeen: number
  present: boolean
  departedAt?: number
}

// What a DiscoverySource emits per resolved instance
export interface DiscoveredService {
  key: string // identity key (lowercased fqdn)
  name: string
  serviceType: string // "_airplay._tcp"
  protocol: 'tcp' | 'udp'
  port: number
  hostname: string // SRV target, "Andy-Mac-Studio.local."
  addresses: string[] // raw ip strings, may include "%zone"
  txt: Record<string, string>
  rawTxt?: RawTxtEntry[]
  ttl?: number
}

export type SourceEvent =
  | { type: 'up' | 'srv-update' | 'txt-update'; service: DiscoveredService }
  | { type: 'down'; key: string }

export interface DiscoverySource {
  start(): void
  stop(): void
  update(): void // rescan / re-query
  expire(): void // ask the underlying browser to drop TTL-expired services
  subscribe(listener: (event: SourceEvent) => void): () => void
}

// Outputs
export interface DiscoverySnapshot {
  hosts: Host[]
  instances: Instance[]
}

export interface DiscoveryDelta {
  upsertHosts?: Host[]
  removeHostIds?: string[]
  upsertInstances?: Instance[]
  removeInstanceKeys?: string[]
}

export interface DiscoveryStatus {
  live: boolean
  scanning: boolean
}
