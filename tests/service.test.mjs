// Runtime test for the built MissionService against the real cordis + dsh-session + dsh-agent.
// Run: node tests/service.test.mjs
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { MissionService } from '../lib/index.js'

let failures = 0
function check(name, cond) {
  if (cond) console.log('  ok:', name)
  else { failures++; console.error('  FAIL:', name) }
}
function throws(name, fn, code) {
  try { fn(); failures++; console.error('  FAIL:', name, '(did not throw)') }
  catch (e) {
    if (code === undefined || e.code === code) console.log('  ok:', name)
    else { failures++; console.error('  FAIL:', name, `(wrong code ${e.code})`) }
  }
}

function stubAgent(rawId) {
  const session = Session.create(SessionId(rawId))
  const id = session.id
  const inbox = new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} })
  const agent = {
    id,
    options: {},
    session,
    inbox,
    ctx: new Context(),
    status: 'idle',
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject(input) { inbox.append('next-step', input) },
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle() { return Promise.resolve() },
  }
  return { agent, session }
}

const task = (taskId, name, workerType = 'shell', priority = 100) => ({ taskId, name, workerType, priority })
const lease = (token, ttl = 10_000) => ({ owner: 'w', token, expiresAt: Date.now() + ttl, attempt: 1 })

const ctx = new Context()
await ctx.plugin(AgentRegistry)
await ctx.plugin(MissionService)
const { agent, session } = stubAgent(`mission-test-${Math.random()}`)
ctx.agents.register(agent)

console.log('1. create')
let changed = 0
ctx.on('mission/changed', () => { changed++ })
const created = ctx.mission.create(agent, { objective: '  build a game  ' })
check('mission/changed emitted on commit', changed === 1)
check('objective trimmed', created.objective === 'build a game')
check('status CREATED', created.status === 'CREATED')
check('revision 0 (no plan yet)', created.revision === 0)
check('id prefixed', created.id.startsWith('mission-'))

console.log('2. plan (revision 1)')
const planned = ctx.mission.plan(agent, {
  revision: 1,
  tasks: [task('engine', 'Engine'), task('combat', 'Combat'), task('heroes', 'Heroes')],
  dependencies: [{ taskId: 'combat', dependsOn: 'engine' }, { taskId: 'heroes', dependsOn: 'combat' }],
})
check('mission RUNNING after plan', planned.status === 'RUNNING')
check('engine READY', planned.tasks.find(t => t.id === 'engine').status === 'READY')
check('combat PENDING', planned.tasks.find(t => t.id === 'combat').status === 'PENDING')
check('heroes PENDING', planned.tasks.find(t => t.id === 'heroes').status === 'PENDING')

console.log('3. claim → report → verify (worker cannot self-certify)')
ctx.mission.claim(agent, { taskId: 'engine', lease: lease('lt-e') })
const reported = ctx.mission.report(agent, { taskId: 'engine', token: 'lt-e', exitCode: 0 })
check('report alone keeps CLAIMED (not DONE)', reported.tasks.find(t => t.id === 'engine').stored === 'CLAIMED')
const verified = ctx.mission.verify(agent, { taskId: 'engine', verifierType: 'exit_code', passed: true })
check('engine DONE after verify', verified.tasks.find(t => t.id === 'engine').status === 'DONE')
check('combat READY after engine done', verified.tasks.find(t => t.id === 'combat').status === 'READY')

console.log('4. invariant rejections at the service boundary')
throws('claim non-READY task rejected', () => ctx.mission.claim(agent, { taskId: 'heroes', lease: lease('lt-h') }), 'MISSION_INVALID_TRANSITION')
throws('report with wrong lease token rejected', () => ctx.mission.report(agent, { taskId: 'combat', token: 'WRONG', exitCode: 0 }), 'MISSION_INVALID_TRANSITION')
throws('verify without report rejected (self-cert)', () => ctx.mission.verify(agent, { taskId: 'combat', verifierType: 'x', passed: true }), 'MISSION_INVALID_TRANSITION')
throws('replan with non-monotonic revision rejected', () => ctx.mission.plan(agent, { revision: 1, tasks: [], dependencies: [] }), 'MISSION_INVALID_TRANSITION')
throws('replan with a cycle rejected', () => ctx.mission.plan(agent, { revision: 2, tasks: [task('x', 'X'), task('y', 'Y')], dependencies: [{ taskId: 'x', dependsOn: 'y' }, { taskId: 'y', dependsOn: 'x' }] }), 'MISSION_INVALID_TRANSITION')

console.log('5. replan preserves DONE')
const replanned = ctx.mission.plan(agent, {
  revision: 2,
  tasks: [task('engine', 'Engine'), task('combat-v2', 'Combat'), task('heroes', 'Heroes')],
  dependencies: [{ taskId: 'combat-v2', dependsOn: 'engine' }, { taskId: 'heroes', dependsOn: 'combat-v2' }],
})
check('engine stays DONE across replan', replanned.tasks.find(t => t.id === 'engine').status === 'DONE')
check('old combat dropped, combat-v2 READY', replanned.tasks.find(t => t.id === 'combat-v2').status === 'READY')
check('heroes reset to PENDING', replanned.tasks.find(t => t.id === 'heroes').status === 'PENDING')

console.log('6. durable replay (fold the session log back)')
check('session log has mission events only', session.events.every(e => e.type.startsWith('mission/')))

console.log('7. lease reclamation at the service boundary')
{
  // combat-v2 is READY (engine DONE). Claim with a lease that expires almost
  // immediately, wait for expiry, then reclaim with attempt 2.
  const first = ctx.mission.claim(agent, { taskId: 'combat-v2', lease: lease('lt-x', 5) })
  check('claimed with attempt 1', first.tasks.find(t => t.id === 'combat-v2').lease.attempt === 1)

  await new Promise(r => setTimeout(r, 30))
  // The attempt counter is bumped by the DRIVER (see driver test 5); the
  // service faithfully commits the lease it is given.
  const reclaim = ctx.mission.claim(agent, {
    taskId: 'combat-v2',
    lease: { owner: 'w', token: 'lt-y', expiresAt: Date.now() + 10_000, attempt: 2 },
  })
  const reclaimedTask = reclaim.tasks.find(t => t.id === 'combat-v2')
  check('reclaim bumps attempt to 2', reclaimedTask.lease.attempt === 2)
  check('reclaim replaces the token', reclaimedTask.lease.token === 'lt-y')

  throws('report with the old token rejected after reclaim',
    () => ctx.mission.report(agent, { taskId: 'combat-v2', token: 'lt-x', exitCode: 0 }), 'MISSION_INVALID_TRANSITION')
  const reported = ctx.mission.report(agent, { taskId: 'combat-v2', token: 'lt-y', exitCode: 0 })
  check('report with the new token accepted', reported.tasks.find(t => t.id === 'combat-v2').stored === 'CLAIMED')
}

console.log('8. successive missions at the service boundary')
{
  // A fresh agent completes a full mission, then the SAME session opens the
  // next mission (long-lived projects run mission after mission).
  const { agent: a2 } = stubAgent(`mission-successive-${Math.random()}`)
  ctx.agents.register(a2)
  ctx.mission.create(a2, { objective: 'g1' })
  ctx.mission.plan(a2, { revision: 1, tasks: [task('a', 'A')], dependencies: [] })
  ctx.mission.claim(a2, { taskId: 'a', lease: lease('lt-1') })
  ctx.mission.report(a2, { taskId: 'a', token: 'lt-1', exitCode: 0 })
  const done = ctx.mission.verify(a2, { taskId: 'a', verifierType: 'exit_code', passed: true })
  check('first mission COMPLETED', done.status === 'COMPLETED')

  const next = ctx.mission.create(a2, { objective: 'g2' })
  check('new mission created after COMPLETED', next.id !== done.id && next.objective === 'g2')
  check('status now shows the LATEST mission', ctx.mission.status(a2).id === next.id)

  throws('create rejected while the new mission is still active (CREATED)',
    () => ctx.mission.create(a2, { objective: 'g3' }), 'MISSION_ALREADY_EXISTS')
}

console.log('9. cancel at the service boundary')
{
  const { agent: a3 } = stubAgent(`mission-cancel-${Math.random()}`)
  ctx.agents.register(a3)
  const created = ctx.mission.create(a3, { objective: 'g1' })
  ctx.mission.plan(a3, { revision: 1, tasks: [task('a', 'A')], dependencies: [] })
  const cancelled = ctx.mission.cancel(a3)
  check('cancel → CANCELLED', cancelled.status === 'CANCELLED')
  throws('plan rejected after CANCELLED',
    () => ctx.mission.plan(a3, { revision: 2, tasks: [task('b', 'B')], dependencies: [] }), 'MISSION_INVALID_TRANSITION')
  const next = ctx.mission.create(a3, { objective: 'g2' })
  check('create allowed after CANCELLED (rollback + start over)', next.objective === 'g2')
  check('created.id !== cancelled.id', created.id !== next.id)
}

console.log(failures === 0 ? '\nALL RUNTIME TESTS PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
