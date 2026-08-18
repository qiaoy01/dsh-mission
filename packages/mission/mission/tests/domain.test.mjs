// Domain + invariant tests.
// Run: node --experimental-strip-types tests/domain.test.mjs
import { foldMission } from '../src/fold.ts'
import { validateEvent, isAcyclic } from '../src/validate.ts'

let failures = 0
function check(name, cond) {
  if (cond) console.log('  ok:', name)
  else {
    failures++
    console.error('  FAIL:', name)
  }
}

const M = 'm1'
const spec = (taskId, name, workerType = 'shell', priority = 100) => ({ taskId, name, workerType, priority })

// --- 1. fold: readiness derivation -----------------------------------------
console.log('1. fold readiness')
{
  const world = foldMission([
    { type: 'mission/created', missionId: M, objective: 'build game' },
    { type: 'mission/plan-committed', missionId: M, revision: 1,
      tasks: [spec('t1', 'scaffold'), spec('t2', 'engine'), spec('t3', 'api')],
      dependencies: [{ taskId: 't2', dependsOn: 't1' }, { taskId: 't3', dependsOn: 't2' }] },
  ])
  const m = world.get(M)
  check('mission RUNNING after plan', m.status === 'RUNNING')
  check('t1 READY (root)', m.tasks.get('t1').status === 'READY')
  check('t2 PENDING (dep t1 not done)', m.tasks.get('t2').status === 'PENDING')
  check('t3 PENDING', m.tasks.get('t3').status === 'PENDING')
}

// --- 2. fold: lifecycle claim→report→verify; dependent becomes READY --------
console.log('2. fold lifecycle')
{
  const now = 1000
  const base = [
    { type: 'mission/created', missionId: M, objective: 'build game' },
    { type: 'mission/plan-committed', missionId: M, revision: 1,
      tasks: [spec('t1', 'scaffold'), spec('t2', 'engine')],
      dependencies: [{ taskId: 't2', dependsOn: 't1' }] },
  ]
  const done = foldMission([...base,
    { type: 'mission/task-claimed', missionId: M, taskId: 't1', lease: { owner: 'w', token: 'lt1', expiresAt: now + 1000, attempt: 1 } },
    { type: 'mission/task-reported', missionId: M, taskId: 't1', token: 'lt1', exitCode: 0 },
    { type: 'mission/task-verified', missionId: M, taskId: 't1', verifierType: 'exit_code', passed: true },
  ])
  const m = done.get(M)
  check('t1 DONE after verify', m.tasks.get('t1').status === 'DONE')
  check('t2 READY after t1 done', m.tasks.get('t2').status === 'READY')

  // report alone must not set DONE (worker cannot self-certify)
  const reported = foldMission([...base,
    { type: 'mission/task-claimed', missionId: M, taskId: 't1', lease: { owner: 'w', token: 'lt1', expiresAt: now + 1000, attempt: 1 } },
    { type: 'mission/task-reported', missionId: M, taskId: 't1', token: 'lt1', exitCode: 0 },
  ])
  check('report alone keeps CLAIMED (not DONE)', reported.get(M).tasks.get('t1').stored === 'CLAIMED')
}

// --- 3. fold: BLOCKED propagation + mission FAILED when stuck ----------------
console.log('3. fold blocked + terminal')
{
  const now = 1000
  const events = [
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1,
      tasks: [spec('a'), spec('b')],
      dependencies: [{ taskId: 'b', dependsOn: 'a' }] },
    { type: 'mission/task-claimed', missionId: M, taskId: 'a', lease: { owner: 'w', token: 'lt', expiresAt: now + 1000, attempt: 1 } },
    { type: 'mission/task-reported', missionId: M, taskId: 'a', token: 'lt', exitCode: 1 },
    { type: 'mission/task-verified', missionId: M, taskId: 'a', verifierType: 'exit_code', passed: false },
  ]
  const m = foldMission(events).get(M)
  check('a FAILED', m.tasks.get('a').status === 'FAILED')
  check('b BLOCKED (dep failed)', m.tasks.get('b').status === 'BLOCKED')
  check('mission FAILED (stuck)', m.status === 'FAILED')
}

// --- 4. fold: replan preserves DONE work, resets unfinished ------------------
console.log('4. fold replan preserves DONE')
{
  const now = 1000
  const rev1 = [
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1,
      tasks: [spec('engine', 'engine'), spec('combat', 'combat'), spec('heroes', 'heroes')],
      dependencies: [{ taskId: 'combat', dependsOn: 'engine' }, { taskId: 'heroes', dependsOn: 'combat' }] },
    // engine → DONE
    { type: 'mission/task-claimed', missionId: M, taskId: 'engine', lease: { owner: 'w', token: 'lt-e', expiresAt: now + 1000, attempt: 1 } },
    { type: 'mission/task-reported', missionId: M, taskId: 'engine', token: 'lt-e', exitCode: 0 },
    { type: 'mission/task-verified', missionId: M, taskId: 'engine', verifierType: 'exit_code', passed: true },
    // combat → FAILED (after engine done)
    { type: 'mission/task-claimed', missionId: M, taskId: 'combat', lease: { owner: 'w', token: 'lt-c', expiresAt: now + 1000, attempt: 1 } },
    { type: 'mission/task-reported', missionId: M, taskId: 'combat', token: 'lt-c', exitCode: 1 },
    { type: 'mission/task-verified', missionId: M, taskId: 'combat', verifierType: 'exit_code', passed: false },
  ]
  const m1 = foldMission(rev1).get(M)
  check('rev1 engine DONE', m1.tasks.get('engine').status === 'DONE')
  check('rev1 combat FAILED', m1.tasks.get('combat').status === 'FAILED')
  check('rev1 heroes BLOCKED (dep combat failed)', m1.tasks.get('heroes').status === 'BLOCKED')
  check('rev1 mission FAILED (stuck)', m1.status === 'FAILED')

  // replan: keep engine (same spec), drop combat for combat-v2, keep heroes (reset)
  const m2 = foldMission([...rev1,
    { type: 'mission/plan-committed', missionId: M, revision: 2,
      tasks: [spec('engine', 'engine'), spec('combat-v2', 'combat'), spec('heroes', 'heroes')],
      dependencies: [{ taskId: 'combat-v2', dependsOn: 'engine' }, { taskId: 'heroes', dependsOn: 'combat-v2' }] },
  ]).get(M)
  check('replan preserves DONE engine', m2.tasks.get('engine').status === 'DONE' && m2.tasks.get('engine').verification?.passed === true)
  check('replan drops failed combat (replaced by combat-v2)', !m2.tasks.has('combat'))
  check('combat-v2 READY (dep engine done)', m2.tasks.get('combat-v2').status === 'READY')
  check('heroes reset to PENDING (dep combat-v2 not done)', m2.tasks.get('heroes').status === 'PENDING')
  check('replan mission RUNNING again', m2.status === 'RUNNING')
}

// --- 5. invariants ----------------------------------------------------------
console.log('5. invariants')
{
  const now = 1000
  const base = foldMission([
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1, tasks: [spec('a'), spec('b')], dependencies: [] },
  ])

  check('reject cycle',
    validateEvent(base, { type: 'mission/plan-committed', missionId: M, revision: 2,
      tasks: [spec('x'), spec('y')], dependencies: [{ taskId: 'x', dependsOn: 'y' }, { taskId: 'y', dependsOn: 'x' }] }, now).length > 0)

  check('reject dangling dependency',
    validateEvent(base, { type: 'mission/plan-committed', missionId: M, revision: 2,
      tasks: [spec('x')], dependencies: [{ taskId: 'x', dependsOn: 'nope' }] }, now).length > 0)

  check('reject non-monotonic revision',
    validateEvent(base, { type: 'mission/plan-committed', missionId: M, revision: 1, tasks: [], dependencies: [] }, now).length > 0)

  check('reject empty objective',
    validateEvent(new Map(), { type: 'mission/created', missionId: 'new', objective: '  ' }, now).length > 0)

  check('reject second mission create (single mission)',
    validateEvent(base, { type: 'mission/created', missionId: 'other', objective: 'x' }, now).length > 0)

  // claim a PENDING task (q depends on p, not done)
  const depWorld = foldMission([
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1,
      tasks: [spec('p'), spec('q')], dependencies: [{ taskId: 'q', dependsOn: 'p' }] },
  ])
  check('reject claim of non-READY task',
    validateEvent(depWorld, { type: 'mission/task-claimed', missionId: M, taskId: 'q', lease: { owner: 'w', token: 'lt', expiresAt: now + 1000, attempt: 1 } }, now).length > 0)

  check('reject claim of unknown task',
    validateEvent(depWorld, { type: 'mission/task-claimed', missionId: M, taskId: 'nope', lease: { owner: 'w', token: 'lt', expiresAt: now + 1000, attempt: 1 } }, now).length > 0)

  // report with wrong lease token
  const claimed = foldMission([
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1, tasks: [spec('a')], dependencies: [] },
    { type: 'mission/task-claimed', missionId: M, taskId: 'a', lease: { owner: 'w', token: 'lt1', expiresAt: now + 1000, attempt: 1 } },
  ])
  check('reject report with wrong lease token',
    validateEvent(claimed, { type: 'mission/task-reported', missionId: M, taskId: 'a', token: 'WRONG', exitCode: 0 }, now).length > 0)

  // verification without report (self-cert)
  check('reject verification without report (self-cert)',
    validateEvent(claimed, { type: 'mission/task-verified', missionId: M, taskId: 'a', verifierType: 'x', passed: true }, now).length > 0)

  // verify an already-DONE task, and cancel a COMPLETED mission
  const done = foldMission([
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1, tasks: [spec('a')], dependencies: [] },
    { type: 'mission/task-claimed', missionId: M, taskId: 'a', lease: { owner: 'w', token: 'lt', expiresAt: now + 1000, attempt: 1 } },
    { type: 'mission/task-reported', missionId: M, taskId: 'a', token: 'lt', exitCode: 0 },
    { type: 'mission/task-verified', missionId: M, taskId: 'a', verifierType: 'x', passed: true },
  ])
  check('reject re-verify of DONE task',
    validateEvent(done, { type: 'mission/task-verified', missionId: M, taskId: 'a', verifierType: 'x', passed: true }, now).length > 0)
  check('reject cancel of COMPLETED mission',
    validateEvent(done, { type: 'mission/cancelled', missionId: M }, now).length > 0)

  // DONE-task spec is immutable across replan: same spec allowed, changed spec rejected
  check('allow re-committing DONE task with same spec',
    validateEvent(done, { type: 'mission/plan-committed', missionId: M, revision: 2,
      tasks: [spec('a')], dependencies: [] }, now).length === 0)
  check('reject changing spec of DONE task on replan',
    validateEvent(done, { type: 'mission/plan-committed', missionId: M, revision: 2,
      tasks: [spec('a', 'renamed')], dependencies: [] }, now).length > 0)

  // isAcyclic helper
  check('isAcyclic true', isAcyclic(['a', 'b'], [{ taskId: 'b', dependsOn: 'a' }]) === true)
  check('isAcyclic false (cycle)', isAcyclic(['a', 'b'], [{ taskId: 'a', dependsOn: 'b' }, { taskId: 'b', dependsOn: 'a' }]) === false)
  check('isAcyclic false (dangling)', isAcyclic(['a'], [{ taskId: 'a', dependsOn: 'nope' }]) === false)
}

// --- 6. mission outcome ------------------------------------------------------
console.log('6. mission outcome')
{
  const now = 1000
  const completed = foldMission([
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1, tasks: [spec('a')], dependencies: [] },
    { type: 'mission/task-claimed', missionId: M, taskId: 'a', lease: { owner: 'w', token: 'lt', expiresAt: now + 1000, attempt: 1 } },
    { type: 'mission/task-reported', missionId: M, taskId: 'a', token: 'lt', exitCode: 0 },
    { type: 'mission/task-verified', missionId: M, taskId: 'a', verifierType: 'x', passed: true },
  ])
  check('mission COMPLETED when all tasks DONE', completed.get(M).status === 'COMPLETED')

  const cancelled = foldMission([
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1, tasks: [spec('a')], dependencies: [] },
    { type: 'mission/cancelled', missionId: M },
  ])
  check('mission CANCELLED by explicit event', cancelled.get(M).status === 'CANCELLED')

  const created = foldMission([{ type: 'mission/created', missionId: M, objective: 'g' }])
  check('mission CREATED before plan', created.get(M).status === 'CREATED')
}

// --- 7. lease reclamation (stage D) ----------------------------------------
console.log('7. lease reclamation')
{
  const now = 1000
  const base = [
    { type: 'mission/created', missionId: M, objective: 'g' },
    { type: 'mission/plan-committed', missionId: M, revision: 1, tasks: [spec('a')], dependencies: [] },
    { type: 'mission/task-claimed', missionId: M, taskId: 'a', lease: { owner: 'w', token: 'lt1', expiresAt: now + 100, attempt: 1 } },
  ]
  const claimed = foldMission(base)
  const reclaim = { type: 'mission/task-claimed', missionId: M, taskId: 'a', lease: { owner: 'w', token: 'lt2', expiresAt: now + 1000, attempt: 2 } }

  check('reclaim allowed once the lease expired without a report',
    validateEvent(claimed, reclaim, now + 200).length === 0)
  check('reclaim rejected while the lease is still live',
    validateEvent(claimed, reclaim, now).length > 0)

  const reported = foldMission([...base,
    { type: 'mission/task-reported', missionId: M, taskId: 'a', token: 'lt1', exitCode: 0 },
  ])
  check('reclaim rejected after a report (goes to verification instead)',
    validateEvent(reported, reclaim, now + 200).length > 0)

  const reclaimed = foldMission([...base, { ...reclaim, lease: { owner: 'w', token: 'lt2', expiresAt: now + 1000, attempt: 2 } }])
  check('fold replaces the lease and keeps CLAIMED',
    reclaimed.get(M).tasks.get('a').lease.token === 'lt2'
    && reclaimed.get(M).tasks.get('a').lease.attempt === 2
    && reclaimed.get(M).tasks.get('a').stored === 'CLAIMED')
}

// --- 8. successive missions: a terminal mission lets a new one open ---------
console.log('8. successive missions (long-lived projects)')
{
  const now = 1000
  const plan1 = { type: 'mission/plan-committed', missionId: M, revision: 1, tasks: [spec('a')], dependencies: [] }
  const completeChain = [
    { type: 'mission/created', missionId: M, objective: 'g1' },
    plan1,
    { type: 'mission/task-claimed', missionId: M, taskId: 'a', lease: { owner: 'w', token: 'lt', expiresAt: now + 1000, attempt: 1 } },
    { type: 'mission/task-reported', missionId: M, taskId: 'a', token: 'lt', exitCode: 0 },
    { type: 'mission/task-verified', missionId: M, taskId: 'a', verifierType: 'x', passed: true },
  ]
  const newCreate = { type: 'mission/created', missionId: 'm2', objective: 'g2' }

  const created = foldMission([{ type: 'mission/created', missionId: M, objective: 'g1' }])
  check('create rejected while a CREATED (draft) mission exists',
    validateEvent(created, newCreate, now).length > 0)

  const running = foldMission([{ type: 'mission/created', missionId: M, objective: 'g1' }, plan1])
  check('create rejected while RUNNING',
    validateEvent(running, newCreate, now).length > 0)

  const completed = foldMission(completeChain)
  check('create ALLOWED after COMPLETED',
    validateEvent(completed, newCreate, now).length === 0)

  const failed = foldMission(completeChain.map((e, i) => i === 4 ? { ...e, passed: false } : e))
  check('create ALLOWED after FAILED',
    validateEvent(failed, newCreate, now).length === 0)

  const cancelled = foldMission([
    { type: 'mission/created', missionId: M, objective: 'g1' },
    plan1,
    { type: 'mission/cancelled', missionId: M },
  ])
  check('create ALLOWED after CANCELLED',
    validateEvent(cancelled, newCreate, now).length === 0)

  const both = foldMission([...completeChain, newCreate])
  check('world keeps both missions (Map supports successive missions)', both.size === 2)
}

console.log(failures === 0 ? '\nALL TESTS PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
