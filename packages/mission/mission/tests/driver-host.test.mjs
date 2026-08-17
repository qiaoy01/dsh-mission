// Runtime test for the mission-driver host: mounts the plugin against a real
// cordis + session + agent with a STUBBED subagents service (no real children,
// no model), then verifies the driver autonomously drives a planned mission to
// COMPLETED through claim → execute → report → verify.
// Run: node tests/driver-host.test.mjs
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { MissionService } from '../lib/index.js'
import { apply as applyDriverHost } from '../lib/src/driver-host.js'

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

/** Stub subagents: every task dispatch succeeds with exitCode 0. */
function stubSubagents() {
  return {
    start: async () => ({
      result: Promise.resolve({ structured: { exitCode: 0 }, stopReason: 'completed' }),
      dispose: async () => {},
    }),
  }
}

async function waitFor(predicate, timeoutMs = 4000) {
  const start = Date.now()
  for (;;) {
    const value = predicate()
    if (value !== undefined && value !== null && value !== false) return value
    if (Date.now() - start > timeoutMs) return predicate()
    await new Promise((r) => setTimeout(r, 25))
  }
}

const task = (taskId, name, priority = 100) => ({ taskId, name, workerType: 'shell', priority })

const ctx = new Context()
await ctx.plugin(AgentRegistry)
await ctx.plugin(MissionService)
ctx.provide('subagents', stubSubagents())
await ctx.plugin({ name: 'mission-driver', inject: ['agents', 'mission', 'subagents'], apply: applyDriverHost }, { tickMs: 0 })
const { agent } = stubAgent(`mission-driver-host-${Math.random()}`)
ctx.agents.register(agent)

console.log('1. driver host autonomously drives a planned mission')
{
  ctx.mission.create(agent, { objective: 'build' })
  ctx.mission.plan(agent, {
    revision: 1,
    tasks: [task('engine', 'E'), task('combat', 'C')],
    dependencies: [{ taskId: 'combat', dependsOn: 'engine' }],
  })
  const view = await waitFor(() => {
    const v = ctx.mission.status(agent)
    return v !== undefined && v.status === 'COMPLETED' ? v : undefined
  })
  check('mission COMPLETED without any manual driving', view.status === 'COMPLETED')
  check('all tasks DONE', view.tasks.every((t) => t.status === 'DONE'))
  check('combat ran after engine (dependency order)', view.tasks.find((t) => t.id === 'engine').stored === 'DONE' && view.tasks.find((t) => t.id === 'combat').stored === 'DONE')
  check('every task has an independent verification', view.tasks.every((t) => t.verification?.passed === true && t.verification.verifierType === 'deterministic'))
}

/** Build a harness with a controllable subagents stub (runs settle on demand). */
async function harnessWithControllableRuns() {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(MissionService)
  const runs = []
  let startCalls = 0
  ctx.provide('subagents', {
    start: async () => {
      startCalls++
      let settle
      const result = new Promise((r) => { settle = r })
      runs.push({ settle })
      return { result, dispose: async () => {} }
    },
  })
  await ctx.plugin({ name: 'mission-driver', inject: ['agents', 'mission', 'subagents'], apply: applyDriverHost }, { tickMs: 20, leaseTtlMs: 60 })
  const { agent, session } = stubAgent(`mission-driver-host-slow-${Math.random()}`)
  const unregister = ctx.agents.register(agent)
  return { ctx, agent, session, runs, startCalls: () => startCalls, unregister }
}

console.log('2. a live subagent is NEVER reclaimed while in flight (bug regression)')
{
  const { ctx, agent, runs, startCalls } = await harnessWithControllableRuns()
  ctx.mission.create(agent, { objective: 'g' })
  ctx.mission.plan(agent, { revision: 1, tasks: [task('a', 'A')], dependencies: [] })
  // Wait well past the lease TTL and several ticks: the task is executing but
  // its lease has expired — it must NOT be reclaimed.
  await new Promise((r) => setTimeout(r, 350))
  check('exactly one child while the task executes (no duplicate reclaim)', startCalls() === 1)
  runs[0].settle({ structured: { exitCode: 0 }, stopReason: 'completed' })
  const view = await waitFor(() => {
    const v = ctx.mission.status(agent)
    return v !== undefined && v.status === 'COMPLETED' ? v : undefined
  })
  check('slow task completes normally', view.status === 'COMPLETED')
  check('still exactly one child after completion', startCalls() === 1)
}

console.log('3. agent re-creation cannot duplicate a live task (bug regression)')
{
  const { ctx, agent, runs, startCalls, unregister } = await harnessWithControllableRuns()
  ctx.mission.create(agent, { objective: 'g' })
  ctx.mission.plan(agent, { revision: 1, tasks: [task('a', 'A')], dependencies: [] })
  await new Promise((r) => setTimeout(r, 100))
  check('drive started one child', startCalls() === 1)

  // Simulate the web session being re-created: dispose the owning agent and
  // register a fresh object for the SAME session id, replaying the persisted
  // session (the real web rehydrates from disk). The old drive's subagent is
  // still in flight; agent/created triggers a new drive that must NOT reclaim
  // the executing task.
  unregister()
  const { agent: agent2, session: session2 } = stubAgent(agent.id)
  for (const event of agent.session.events) session2.append(event.type, event.data)
  ctx.agents.register(agent2)
  await new Promise((r) => setTimeout(r, 250))
  check('no duplicate child after agent re-creation while task executes', startCalls() === 1)

  // The old drive's subagent finishes; the old agent is gone, so its report
  // cannot commit — the claim stays stale and the next tick reclaims it under
  // the NEW agent (crash-recovery redo).
  runs[0].settle({ structured: { exitCode: 0 }, stopReason: 'completed' })
  const redone = await waitFor(() => startCalls() >= 2, 4000)
  check('stale claim reclaimed and re-executed under the new agent', redone)
  runs[1].settle({ structured: { exitCode: 0 }, stopReason: 'completed' })
  const view = await waitFor(() => {
    const v = ctx.mission.status(agent2)
    return v !== undefined && v.status === 'COMPLETED' ? v : undefined
  })
  check('mission COMPLETED after redo', view.status === 'COMPLETED')
}

console.log(failures === 0 ? '\nALL DRIVER-HOST TESTS PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
