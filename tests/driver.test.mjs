// Runtime test for the mission driver loop against the real cordis + session +
// agent, with a mock executor (the subagent dispatch is exercised only in a
// real dsh profile). Run: node tests/driver.test.mjs
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { MissionService, driveMission, deterministicVerifier } from '../lib/index.js'

let failures = 0
function check(name, cond) {
  if (cond) console.log('  ok:', name)
  else { failures++; console.error('  FAIL:', name) }
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

async function harness() {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(MissionService)
  const { agent, session } = stubAgent(`mission-drive-${Math.random()}`)
  ctx.agents.register(agent)
  return { ctx, agent, session }
}

const task = (taskId, name, priority = 100) => ({ taskId, name, workerType: 'shell', priority })
const plan = (agent, ctx, revision, tasks, deps) => {
  ctx.mission.create(agent, { objective: 'build' })
  ctx.mission.plan(agent, { revision, tasks, dependencies: deps })
}

console.log('1. full lifecycle (dependency order)')
{
  const { ctx, agent, session } = await harness()
  plan(agent, ctx, 1,
    [task('engine', 'E'), task('combat', 'C'), task('heroes', 'H')],
    [{ taskId: 'combat', dependsOn: 'engine' }, { taskId: 'heroes', dependsOn: 'combat' }])
  const calls = []
  const executor = async (_agent, t) => { calls.push(t.id); return { exitCode: 0, output: { id: t.id } } }
  const view = await driveMission(agent, ctx.mission, { executor, verifier: deterministicVerifier() })
  check('mission COMPLETED', view.status === 'COMPLETED')
  check('all tasks DONE', view.tasks.every(t => t.status === 'DONE'))
  check('executed in dependency order', JSON.stringify(calls) === JSON.stringify(['engine', 'combat', 'heroes']))
  check('3 verify events committed', session.events.filter(e => e.type === 'mission/task-verified').length === 3)
}

console.log('2. failure blocks downstream')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1,
    [task('engine', 'E'), task('combat', 'C'), task('heroes', 'H')],
    [{ taskId: 'combat', dependsOn: 'engine' }, { taskId: 'heroes', dependsOn: 'combat' }])
  const executor = async (_agent, t) => ({ exitCode: t.id === 'combat' ? 1 : 0 })
  const view = await driveMission(agent, ctx.mission, { executor, verifier: deterministicVerifier() })
  check('mission FAILED (stuck)', view.status === 'FAILED')
  check('engine DONE', view.tasks.find(t => t.id === 'engine').status === 'DONE')
  check('combat FAILED', view.tasks.find(t => t.id === 'combat').status === 'FAILED')
  check('heroes BLOCKED', view.tasks.find(t => t.id === 'heroes').status === 'BLOCKED')
}

console.log('3. maxSteps cap')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1, [task('a', 'A'), task('b', 'B'), task('c', 'C')], [])
  const executor = async () => ({ exitCode: 0 })
  const view = await driveMission(agent, ctx.mission, { executor, verifier: deterministicVerifier(), maxSteps: 1 })
  check('exactly one terminal task', view.tasks.filter(t => t.status === 'DONE' || t.status === 'FAILED').length === 1)
  check('mission still RUNNING', view.status === 'RUNNING')
}

console.log('4. priority order on a flat DAG')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1, [task('low', 'L', 1), task('mid', 'M', 50), task('high', 'H', 100)], [])
  const calls = []
  const executor = async (_agent, t) => { calls.push(t.id); return { exitCode: 0 } }
  await driveMission(agent, ctx.mission, { executor, verifier: deterministicVerifier() })
  check('high → mid → low', JSON.stringify(calls) === JSON.stringify(['high', 'mid', 'low']))
}

console.log('5. lease reclaim after an executor crash (stage D)')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1, [task('a', 'A')], [])
  let threw = false
  try {
    await driveMission(agent, ctx.mission, {
      executor: async () => { throw new Error('worker crashed') },
      verifier: deterministicVerifier(),
      leaseTtlMs: 5,
    })
  } catch { threw = true }
  check('first drive throws on executor crash', threw)

  await new Promise(r => setTimeout(r, 30)) // lease expired, no report committed
  const view = await driveMission(agent, ctx.mission, {
    executor: async (_a, t) => ({ exitCode: 0 }),
    verifier: deterministicVerifier(),
  })
  check('expired claim reclaimed and completed', view.status === 'COMPLETED')
  check('reclaim bumped attempt to 2', view.tasks.find(t => t.id === 'a').lease.attempt === 2)
}

console.log('6. decider picks the next task; undefined falls back (stage D)')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1, [task('low', 'L', 1), task('high', 'H', 100)], [])
  const calls = []
  const decider = async (_view, candidates) => candidates.find(t => t.id === 'low')
  await driveMission(agent, ctx.mission, {
    executor: async (_a, t) => { calls.push(t.id); return { exitCode: 0 } },
    verifier: deterministicVerifier(),
    decider,
  })
  check('decider overrides priority order', JSON.stringify(calls) === JSON.stringify(['low', 'high']))
}
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1, [task('low', 'L', 1), task('high', 'H', 100)], [])
  const calls = []
  const decider = async () => undefined
  await driveMission(agent, ctx.mission, {
    executor: async (_a, t) => { calls.push(t.id); return { exitCode: 0 } },
    verifier: deterministicVerifier(),
    decider,
  })
  check('undefined decider falls back to deterministic', JSON.stringify(calls) === JSON.stringify(['high', 'low']))
}

console.log('7. replan on failure preserves DONE and reworks failed (stage D)')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1,
    [task('engine', 'E'), task('combat', 'C')],
    [{ taskId: 'combat', dependsOn: 'engine' }])
  const executor = async (_a, t) => ({ exitCode: t.id === 'combat' ? 1 : 0 })
  const replanner = () => ({
    tasks: [task('engine', 'E'), task('combat-v2', 'Combat v2')],
    dependencies: [{ taskId: 'combat-v2', dependsOn: 'engine' }],
  })
  const view = await driveMission(agent, ctx.mission, { executor, verifier: deterministicVerifier(), replanner })
  check('replanned and completed', view.status === 'COMPLETED')
  check('revision advanced to 2', view.revision === 2)
  check('DONE engine preserved', view.tasks.find(t => t.id === 'engine').status === 'DONE')
  check('reworked combat-v2 DONE', view.tasks.find(t => t.id === 'combat-v2').status === 'DONE')
  check('failed combat dropped', !view.tasks.some(t => t.id === 'combat'))
}

console.log('8. approval gate blocks the replan (stage D)')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1, [task('a', 'A')], [])
  const executor = async () => ({ exitCode: 1 })
  const replanner = () => ({ tasks: [task('a2', 'A2')], dependencies: [] })
  const approval = async () => false
  const view = await driveMission(agent, ctx.mission, {
    executor, verifier: deterministicVerifier(), replanner, approval,
  })
  check('mission stays FAILED when approval rejects', view.status === 'FAILED')
  check('no replan committed', view.revision === 1)
}

console.log('9. maxReplans bounds the loop (stage D)')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1, [task('a', 'A')], [])
  const executor = async () => ({ exitCode: 1 })
  const replanner = (view) => ({ tasks: [task(`a${view.revision + 1}`, 'A')], dependencies: [] })
  const view = await driveMission(agent, ctx.mission, {
    executor, verifier: deterministicVerifier(), replanner, maxReplans: 2,
  })
  check('stopped after maxReplans', view.status === 'FAILED')
  check('replanned exactly twice (revision 3)', view.revision === 3)
}

console.log('10. a cancelled mission stops the driver (clean terminate)')
{
  const { ctx, agent } = await harness()
  plan(agent, ctx, 1, [task('a', 'A')], [])
  ctx.mission.cancel(agent)
  const calls = []
  const view = await driveMission(agent, ctx.mission, {
    executor: async (_a, t) => { calls.push(t.id); return { exitCode: 0 } },
    verifier: deterministicVerifier(),
  })
  check('driver returns the CANCELLED view', view.status === 'CANCELLED')
  check('no task executed after cancel', calls.length === 0)
}

console.log(failures === 0 ? '\nALL DRIVER TESTS PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
