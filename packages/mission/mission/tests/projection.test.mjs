// Projection unit tests: the mission session projection (UI data plane) must
// fold mission events into a plain-JSON summary, keep the same state reference
// for non-mission events, and never drift from the domain fold.
// Run: node --experimental-strip-types tests/projection.test.mjs
import { applyMissionProjection, initMissionProjection, viewMissionProjection } from '../src/projection.ts'

let failures = 0
function check(name, cond) {
  if (cond) console.log('  ok:', name)
  else { failures++; console.error('  FAIL:', name) }
}

const ev = (type, data, seq) => ({ type, seq, time: 0, data })
const spec = (taskId, name, workerType = 'shell', priority = 100) => ({ taskId, name, workerType, priority })

console.log('1. fold mission events into the projection')
{
  let s = initMissionProjection()
  check('empty log → mission null', viewMissionProjection(s).mission === null)

  s = applyMissionProjection(s, ev('mission/created', { missionId: 'm1', objective: 'g' }, 1))
  let v = viewMissionProjection(s)
  check('created reflected', v.mission?.objective === 'g' && v.mission?.status === 'CREATED')

  // non-mission events must return the SAME state reference (Object.is gate)
  const before = s
  s = applyMissionProjection(s, ev('user/message', { content: 'hi' }, 2))
  check('non-mission event keeps same state reference', s === before)

  s = applyMissionProjection(s, ev('mission/plan-committed', {
    missionId: 'm1', revision: 1,
    tasks: [spec('engine', 'E'), spec('combat', 'C')],
    dependencies: [{ taskId: 'combat', dependsOn: 'engine' }],
  }, 3))
  v = viewMissionProjection(s)
  check('plan reflected with derived READY/PENDING', v.mission?.status === 'RUNNING'
    && v.mission?.tasks[0]?.status === 'READY' && v.mission?.tasks[1]?.status === 'PENDING')
  check('revision carried', v.mission?.revision === 1)
}

console.log('2. task lifecycle and attempt in the projection')
{
  let s = initMissionProjection()
  for (const e of [
    ev('mission/created', { missionId: 'm1', objective: 'g' }, 1),
    ev('mission/plan-committed', { missionId: 'm1', revision: 1, tasks: [spec('a', 'A')], dependencies: [] }, 2),
    ev('mission/task-claimed', { missionId: 'm1', taskId: 'a', lease: { owner: 'w', token: 'lt', expiresAt: 9999, attempt: 1 } }, 3),
  ]) s = applyMissionProjection(s, e)
  let v = viewMissionProjection(s)
  check('CLAIMED with attempt', v.mission?.tasks[0]?.stored === 'CLAIMED' && v.mission?.tasks[0]?.attempt === 1)

  s = applyMissionProjection(s, ev('mission/task-reported', { missionId: 'm1', taskId: 'a', token: 'lt', exitCode: 0 }, 4))
  s = applyMissionProjection(s, ev('mission/task-verified', { missionId: 'm1', taskId: 'a', verifierType: 'exit_code', passed: true }, 5))
  v = viewMissionProjection(s)
  check('DONE after verify', v.mission?.tasks[0]?.status === 'DONE')
  check('mission COMPLETED', v.mission?.status === 'COMPLETED')
}

console.log(failures === 0 ? '\nALL PROJECTION TESTS PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
