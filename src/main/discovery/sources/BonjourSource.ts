import { Bonjour } from 'bonjour-service'
import { networkInterfaces } from 'node:os'
import type { DiscoveredService, DiscoverySource, RawTxtEntry, SourceEvent } from '../../../shared/types'
import { instanceKey } from '../identity'

export interface BonjourLikeService {
  name: string
  type: string
  protocol: 'tcp' | 'udp'
  port: number
  host: string
  fqdn: string
  addresses?: string[]
  txt?: Record<string, unknown>
  ttl?: number
}

export interface BrowserLike {
  on(event: string, cb: (s: BonjourLikeService) => void): void
  update(): void
  expire(): void
  stop(): void
}

export interface BonjourLike {
  find(opts: null): BrowserLike
  destroy(): void
}

export type BonjourFactory = (kind: 'udp4' | 'udp6') => BonjourLike | null

export function decodeTxt(txt: Record<string, unknown>): { txt: Record<string, string>; rawTxt: RawTxtEntry[] } {
  const out: Record<string, string> = {}
  const raw: RawTxtEntry[] = []
  for (const [key, v] of Object.entries(txt)) {
    if (v === true || v === null || v === undefined) {
      raw.push({ key, value: null })
    } else if (Buffer.isBuffer(v)) {
      const s = v.toString('utf8')
      out[key] = s
      raw.push({ key, value: s })
    } else {
      const s = String(v)
      out[key] = s
      raw.push({ key, value: s })
    }
  }
  return { txt: out, rawTxt: raw }
}

export function toDiscoveredService(s: BonjourLikeService): DiscoveredService {
  const { txt, rawTxt } = decodeTxt(s.txt ?? {})
  return {
    key: instanceKey(s.fqdn),
    name: s.name,
    serviceType: `_${s.type}._${s.protocol}`,
    protocol: s.protocol,
    port: s.port,
    hostname: s.host,
    addresses: s.addresses ?? [],
    txt,
    rawTxt,
    ttl: s.ttl,
  }
}

function defaultIpv6InterfaceAddress(): string | undefined {
  const ifaces = networkInterfaces()
  for (const addrs of Object.values(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv6' && !a.internal && a.address.toLowerCase().startsWith('fe80')) {
        return a.scopeid ? `${a.address}%${a.scopeid}` : a.address
      }
    }
  }
  return undefined
}

const defaultFactory: BonjourFactory = (kind) => {
  if (kind === 'udp4') return new Bonjour() as unknown as BonjourLike
  const iface = defaultIpv6InterfaceAddress()
  if (!iface) return null
  return new Bonjour({ type: 'udp6', ip: 'ff02::fb', interface: iface } as never) as unknown as BonjourLike
}

export class BonjourSource implements DiscoverySource {
  private readonly createBonjour: BonjourFactory
  private engines: BonjourLike[] = []
  private browsers: BrowserLike[] = []
  private listeners = new Set<(event: SourceEvent) => void>()

  constructor(options?: { createBonjour?: BonjourFactory }) {
    this.createBonjour = options?.createBonjour ?? defaultFactory
  }

  start(): void {
    for (const kind of ['udp4', 'udp6'] as const) {
      const engine = this.createBonjour(kind)
      if (!engine) continue
      const browser = engine.find(null)
      browser.on('up', (s) => this.emit({ type: 'up', service: toDiscoveredService(s) }))
      browser.on('srv-update', (s) => this.emit({ type: 'srv-update', service: toDiscoveredService(s) }))
      browser.on('txt-update', (s) => this.emit({ type: 'txt-update', service: toDiscoveredService(s) }))
      browser.on('down', (s) => this.emit({ type: 'down', key: instanceKey(s.fqdn) }))
      this.engines.push(engine)
      this.browsers.push(browser)
    }
  }

  stop(): void {
    for (const b of this.browsers) b.stop()
    for (const e of this.engines) e.destroy()
    this.browsers = []
    this.engines = []
  }

  update(): void {
    for (const b of this.browsers) b.update()
  }

  expire(): void {
    for (const b of this.browsers) b.expire()
  }

  subscribe(listener: (event: SourceEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: SourceEvent): void {
    for (const l of [...this.listeners]) l(event)
  }
}
