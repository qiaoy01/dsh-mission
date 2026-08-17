// mission-driver — the autonomous driver HOST. Where `driveMission` is the
// loop and `subagentExecutor` the production executor, this plugin mounts them
// into the live harness: it watches every owning session's mission and
// advances it through claim → subagent execute → report → verify → commit
// whenever the agent is idle. Lease reclamation is lazy: an expired claim is
// reclaimed on the next event or on a periodic tick. Model-driven strategies
// (decider / replanner) are opt-in via row config, so the default composition
// costs no model calls.
// @module @deepseek-ai/dsh-mission/driver-host

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { deterministicVerifier, driveMission } from './driver.ts'
import type { DriveOptions } from './driver.ts'
import { registerMissionEventTypes } from './domain.ts'
import { subagentExecutor } from './executor.ts'
import { llmDecider, llmReplanner } from './llm.ts'

export const name = 'mission-driver'
/** Hard deps: agent registry (liveness), mission service, subagent dispatch. */
export const inject = ['agents', 'mission', 'subagents']

export interface MissionDriverConfig {
  /** Task selection: 'deterministic' (default) or 'llm' (model advises, loop commits). */
  decider?: 'deterministic' | 'llm'
  /** Enable model-driven replan when the mission is stuck (default false). */
  replan?: boolean
  /** Model route overrides for llm strategies (else agentDefaultModel). */
  provider?: string
  model?: string
  /** Subagent provider name (default 'spawn'). */
  subagentProvider?: string
  leaseTtlMs?: number
  maxSteps?: number
  maxReplans?: number
  /** Periodic tick for expired-lease reclamation (ms; default 15_000). */
  tickMs?: number
}

/** Install the mission driver host over every live agent. */
export function apply(ctx: Context, config: MissionDriverConfig = {}): void {
  registerMissionEventTypes()
  const leaseTtlMs = config.leaseTtlMs ?? 60_000
  const subagentProvider = config.subagentProvider ?? 'spawn'
  /** In-flight drive per live agent; a second trigger marks the agent dirty. */
  const driving = new Map<Agent, Promise<void>>()
  /** Agents with a pending drive request (a trigger arrived while busy). */
  const pending = new Set<Agent>()
  /** Agents whose mission may need a reclaim tick (last seen mission owners). */
  const known = new Set<Agent>()
  /**
   * Task ids whose executor is STILL in flight (a subagent is running). Lease
   * reclamation must NEVER touch these: an expired lease on a live task means
   * "the worker is taking longer than the TTL", not "the worker crashed".
   * Without this set, an agent re-creation (which clears `driving`) lets a
   * stale reclaim spawn a second subagent for the same task.
   */
  const executing = new Set<string>()

  function buildOptions(agent: Agent): DriveOptions {
    const inner = subagentExecutor(ctx, subagentProvider)
    const options: DriveOptions = {
      executor: async (a, task) => {
        executing.add(task.id)
        try {
          return await inner(a, task)
        } finally {
          executing.delete(task.id)
        }
      },
      verifier: deterministicVerifier(),
      leaseTtlMs,
      ...(config.maxSteps === undefined ? {} : { maxSteps: config.maxSteps }),
    }
    if (config.decider === 'llm') {
      options.decider = llmDecider(ctx, {
        ...(config.provider === undefined ? {} : { provider: config.provider }),
        ...(config.model === undefined ? {} : { model: config.model }),
      })
    }
    if (config.replan === true) {
      options.replanner = llmReplanner(ctx, {
        ...(config.provider === undefined ? {} : { provider: config.provider }),
        ...(config.model === undefined ? {} : { model: config.model }),
      })
      if (config.maxReplans !== undefined) options.maxReplans = config.maxReplans
    }
    return options
  }

  /** Whether the exact agent is still live (drive runs independently of its turn). */
  function live(agent: Agent): boolean {
    return ctx.agents.get(agent.id) === agent
  }

  async function runDrive(agent: Agent): Promise<void> {
    try {
      // Yield once so the caller's `driving.set` runs BEFORE driveMission can
      // synchronously re-enter this module through mission/changed (emitted by
      // its own claim). Otherwise the re-entrant drive races the map write.
      await null
      // driveMission runs to quiescence: it returns when the mission is
      // terminal or no task is claimable. A crashed executor propagates and
      // leaves the claim to expire; the next event or tick reclaims it.
      await driveMission(agent, ctx.mission, buildOptions(agent))
    } catch (error) {
      // Surface on the host; never take the process down for one agent.
      console.warn(`mission-driver: drive for ${agent.id} failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
    } finally {
      driving.delete(agent)
      if (pending.delete(agent)) void drive(agent)
    }
  }

  /** Drive one agent's mission if it needs it; queue while one drive is in flight. */
  function drive(agent: Agent): void {
    known.add(agent)
    if (driving.has(agent)) {
      pending.add(agent)
      return
    }
    if (!live(agent)) {
      pending.add(agent)
      return
    }
    // A task whose subagent is STILL in flight must never be reclaimed, even
    // when its lease expired (long-running work, not a crash) and even when
    // the driving map was cleared by an agent re-creation. The in-flight
    // drive will report when its subagent settles; the stale claim then
    // becomes reclaimable and the next trigger redoes it.
    try {
      const view = ctx.mission.status(agent)
      if (view !== undefined && view.tasks.some((t) =>
        t.stored === 'CLAIMED' && t.lease !== null && t.lease.expiresAt <= Date.now()
        && t.report === null && executing.has(t.id))) {
        return
      }
    } catch {
      /* agent disposed between checks — the next trigger decides */
    }
    const p = runDrive(agent)
    driving.set(agent, p)
    void p
  }

  // Every committed mission mutation may unblock work (or an expired claim).
  // The driver runs as independent host work (subagent dispatch), so it starts
  // as soon as the plan commits — even while the owning agent is mid-turn.
  ctx.on('mission/changed', ({ agent }) => {
    drive(agent)
  })

  // Lazy lease reclamation without any event: scan ALL live agents periodically
  // (not just `known` — a driver restart must rediscover existing missions, and
  // crash recovery must not depend on a browser reconnect). A claim is reclaimed
  // only when NO subagent is still executing the task — an expired lease on a
  // live task is long-running work, not a crash.
  // The timer belongs to this fiber via ctx.effect (cleared on unload).
  if (config.tickMs !== 0) {
    ctx.effect(() => {
      const id = setInterval(() => {
        let agents: Agent[]
        try {
          agents = ctx.agents.list()
        } catch {
          return
        }
        for (const agent of agents) {
          if (driving.has(agent)) continue
          try {
            const view = ctx.mission.status(agent)
            if (view === undefined) continue
            const needsReclaim = view.tasks.some((t) =>
              t.stored === 'CLAIMED' && t.lease !== null && t.lease.expiresAt <= Date.now()
              && t.report === null && !executing.has(t.id))
            if (needsReclaim) drive(agent)
          } catch {
            /* agent disposed between iteration steps */
          }
        }
      }, config.tickMs ?? 15_000)
      return () => clearInterval(id)
    })
  }

  // Forget agents that go away; drive freshly created ones on first contact.
  ctx.on('agent/disposed', ({ agent }) => {
    driving.delete(agent)
    pending.delete(agent)
    known.delete(agent)
  })
  ctx.on('agent/created', ({ agent }) => {
    drive(agent)
  })
}
