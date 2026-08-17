// Package-owned durable mission-stream invariant companion.
// Registers with `ctx.invariants` and independently re-validates every
// mission event before publication and on load. Mirrors dsh-goal's
// ./invariant companion.
//
// The `invariants` service is a development composition: a shipped host never
// loads @deepseek-ai/dsh-invariants (documented in dsh-agent-presets), so this
// companion must NOT hard-inject it or installing the mission bundle into a
// production profile would fail boot. Instead it registers whenever the
// service is present in its scope and subscribes to `internal/service` to
// register as soon as the service appears later (row order is irrelevant).
// Where `invariants` never exists, the companion is a harmless no-op and the
// mission stream is audited by the service's own pre-append validation.
// @module @deepseek-ai/dsh-mission/invariant

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { missionEventOf, registerMissionEventTypes } from './domain.ts'
import { foldMission } from './fold.ts'
import { validateEvent } from './validate.ts'
import type { MissionEvent } from './types.ts'

const PACKAGE_NAME = '@qiaoy01/mission'

/** Cordis companion plugin name. */
export const name = 'mission-invariant'
/** No hard inject: the `invariants` service exists only in dev/test compositions. */
export const inject: readonly string[] = []

/** Fold every committed mission event of one session, in order. */
function collect(session: Session): MissionEvent[] {
  const out: MissionEvent[] = []
  for (const event of session.events) {
    const me = missionEventOf(event)
    if (me !== null) out.push(me)
  }
  return out
}

/** Audit one candidate session event against the prior committed mission stream. */
function auditCandidate(session: Session, event: SessionEvent, fail: InvariantFailure): void {
  const me = missionEventOf(event)
  if (me === null) return
  const world = foldMission(collect(session))
  const violations = validateEvent(world, me, Date.now())
  if (violations.length > 0) {
    fail(`session event ${event.seq} violates the durable mission stream: ${violations.join('; ')}`)
  }
}

/** Audit a session's whole committed mission stream (load-time corruption check). */
function auditSession(session: Session, fail: InvariantFailure): void {
  const prior: MissionEvent[] = []
  for (const event of session.events) {
    const me = missionEventOf(event)
    if (me === null) continue
    const violations = validateEvent(foldMission(prior), me, Date.now())
    if (violations.length > 0) {
      fail(`session event ${event.seq} violates the durable mission stream: ${violations.join('; ')}`)
      return
    }
    prior.push(me)
  }
}

/** Install an independent fold over every attached session. */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  for (const session of ctx.sessions.list()) auditSession(session, fail)
  ctx.on('session/created', (session) => {
    auditSession(session, fail)
  }, { global: true })
  ctx.on('internal/dispatch', (_mode, eventName, args) => {
    if (eventName !== 'session/event') return
    const [session, event] = args as [Session, SessionEvent]
    auditCandidate(session, event, fail)
  }, { global: true })
}, { inject: ['sessions'] })

/**
 * Register the mission-stream invariant companion whenever the `invariants`
 * service is available in this scope. Registration is idempotent; the
 * `internal/service` listener re-registers after a service removal cycle
 * (e.g. an HMR reload of the registry row).
 * @param ctx - Cordis context carrying the optional invariant service.
 */
export function apply(ctx: Context): void {
  registerMissionEventTypes()
  let registered = false
  const register = (): void => {
    if (registered) return
    const invariants = ctx.get('invariants')
    if (invariants === undefined) return
    invariants.register(PACKAGE_NAME, install)
    registered = true
  }
  register()
  ctx.on('internal/service', (serviceName, value) => {
    if (serviceName !== 'invariants') return
    if (value === undefined) registered = false
    else register()
  }, { global: true })
}
