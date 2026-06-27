import type {
  DiscoveryDelta,
  DiscoverySnapshot,
  DiscoverySource,
  DiscoveryStatus,
  SourceEvent,
} from '../../shared/types'
import { DiscoveryStore } from './store'

export type ManagerEvent =
  | { type: 'snapshot'; snapshot: DiscoverySnapshot }
  | { type: 'delta'; delta: DiscoveryDelta }
  | { type: 'status'; status: DiscoveryStatus }

export interface DiscoveryManagerOptions {
  source: DiscoverySource
  onEvent: (event: ManagerEvent) => void
  expireIntervalMs?: number
  pruneGraceMs?: number
  scanWindowMs?: number
  now?: () => number
}

export class DiscoveryManager {
  private readonly source: DiscoverySource
  private readonly onEvent: (event: ManagerEvent) => void
  private readonly expireIntervalMs: number
  private readonly pruneGraceMs: number
  private readonly scanWindowMs: number
  private readonly now: () => number

  private store = new DiscoveryStore()
  private unsubscribe?: () => void
  private timer?: ReturnType<typeof setInterval>
  private scanTimer?: ReturnType<typeof setTimeout>
  private live = false

  constructor(options: DiscoveryManagerOptions) {
    this.source = options.source
    this.onEvent = options.onEvent
    this.expireIntervalMs = options.expireIntervalMs ?? 1000
    this.pruneGraceMs = options.pruneGraceMs ?? 30_000
    this.scanWindowMs = options.scanWindowMs ?? 1200
    this.now = options.now ?? Date.now
  }

  start(): void {
    this.unsubscribe = this.source.subscribe((e) => this.handleSourceEvent(e))
    this.source.start()
    this.live = true
    this.startTimer()
    this.onEvent({ type: 'snapshot', snapshot: this.store.snapshot() })
    this.emitStatus(false)
  }

  stop(): void {
    this.stopTimer()
    if (this.scanTimer) clearTimeout(this.scanTimer)
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.source.stop()
    this.live = false
  }

  setLive(on: boolean): void {
    if (on === this.live) return
    if (on) {
      this.source.start()
      this.startTimer()
      this.live = true
    } else {
      this.stopTimer()
      this.source.stop()
      this.live = false
    }
    this.emitStatus(false)
  }

  rescan(): void {
    this.source.update()
    this.emitStatus(true)
    if (this.scanTimer) clearTimeout(this.scanTimer)
    this.scanTimer = setTimeout(() => this.emitStatus(false), this.scanWindowMs)
  }

  resolve(_key: string): void {
    // v1: a targeted resolve is a network re-query; the engine re-queries all.
    this.source.update()
  }

  getSnapshot(): DiscoverySnapshot {
    return this.store.snapshot()
  }

  private handleSourceEvent(e: SourceEvent): void {
    const delta = e.type === 'down' ? this.store.markDown(e.key, this.now()) : this.store.upsert(e.service, this.now())
    if (hasDelta(delta)) this.onEvent({ type: 'delta', delta })
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => this.tick(), this.expireIntervalMs)
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private tick(): void {
    this.source.expire()
    const delta = this.store.prune(this.now(), this.pruneGraceMs)
    if (hasDelta(delta)) this.onEvent({ type: 'delta', delta })
  }

  private emitStatus(scanning: boolean): void {
    this.onEvent({ type: 'status', status: { live: this.live, scanning } })
  }
}

function hasDelta(d: DiscoveryDelta): boolean {
  return Boolean(
    d.upsertInstances?.length || d.upsertHosts?.length || d.removeInstanceKeys?.length || d.removeHostIds?.length,
  )
}
