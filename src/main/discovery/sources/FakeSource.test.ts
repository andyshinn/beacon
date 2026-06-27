import { describe, it, expect, vi } from 'vitest'
import { FakeSource, makeService } from './FakeSource'

describe('FakeSource', () => {
  it('delivers emitted events to subscribers and supports unsubscribe', () => {
    const src = new FakeSource()
    const seen = vi.fn()
    const unsub = src.subscribe(seen)
    const svc = makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.' })
    src.emit({ type: 'up', service: svc })
    expect(seen).toHaveBeenCalledWith({ type: 'up', service: svc })
    unsub()
    src.emit({ type: 'down', key: svc.key })
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('tracks lifecycle and command calls', () => {
    const src = new FakeSource()
    expect(src.started).toBe(false)
    src.start()
    expect(src.started).toBe(true)
    src.update()
    src.update()
    src.expire()
    src.stop()
    expect(src.updateCalls).toBe(2)
    expect(src.expireCalls).toBe(1)
    expect(src.started).toBe(false)
  })

  it('makeService derives a normalized identity key', () => {
    const svc = makeService({ name: 'Porch', serviceType: '_http._tcp', hostname: 'porch.local.' })
    expect(svc.key).toBe('porch._http._tcp.local.')
    expect(svc.protocol).toBe('tcp')
    expect(svc.port).toBeGreaterThan(0)
  })
})
