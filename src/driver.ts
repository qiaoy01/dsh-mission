// driver — the autonomous mission control loop: read → decide → claim →
// execute → report → verify → commit, with lazy lease reclamation and
// model-driven replan on failure. The executor (subagent dispatch in
// production), verifier (independent alignment), decider (which task next)
// and replanner (new revision on a stuck mission) are all injected, so the
// loop is unit-testable without the agent loop or the model.
// @module @deepseek-ai/dsh-mission

import { randomUUID } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { MissionService, MissionView, TaskView } from './service.ts'
import type { Dependency, TaskSpec } from './types.ts'

export type { MissionView, TaskView } from './service.ts'

/** The outcome of running one claimed task against the environment. */
export interface TaskOutcome {
  exitCode: number
  output?: unknown
}

/** Independent verdict: aligns a task declaration with environment feedback. */
export interface Verdict {
  passed: boolean
  verifierType: string
  evidence?: unknown
}

/** Runs one claimed task against the environment. */
export type TaskExecutor = (agent: Agent, task: TaskView) => Promise<TaskOutcome>

/** Independently aligns a task declaration with environment feedback. */
export type TaskVerifier = (task: TaskView, outcome: TaskOutcome) => Verdict

/**
 * Model/strategy-driven choice of the next task among the claimable
 * candidates (READY tasks plus expired-lease reclamations). Returning
 * `undefined` falls back to the deterministic pick.
 */
export type TaskDecider = (
  view: MissionView,
  candidates: TaskView[],
) => Promise<TaskView | undefined> | TaskView | undefined

/** A full next-revision plan: an entirely new task/dependency snapshot. */
export interface PlanProposal {
  tasks: TaskSpec[]
  dependencies: Dependency[]
}

/** Produces the next plan revision when the mission is stuck (FAILED). */
export type TaskReplanner = (view: MissionView) => Promise<PlanProposal> | PlanProposal

/** Optional human/policy gate before a replan is committed. */
export type ReplanApproval = (agent: Agent, view: MissionView, proposal: PlanProposal) => Promise<boolean> | boolean

export interface DriveOptions {
  executor: TaskExecutor
  verifier: TaskVerifier
  /** Hard cap on dispatched tasks per drive call. */
  maxSteps?: number
  leaseTtlMs?: number
  owner?: string
  /** Strategy for choosing the next task among claimable candidates. */
  decider?: TaskDecider
  /** Replan producer used when the mission reaches FAILED (stuck). */
  replanner?: TaskReplanner
  /** Gate run before a replan commits; absent = auto-approve. */
  approval?: ReplanApproval
  /** Hard cap on replans per drive call (a replan can fail again). */
  maxReplans?: number
}

/** Whether a task is claimable now: READY, or its prior lease expired without a report. */
export function isClaimable(t: TaskView, now: number): boolean {
  if (t.status === 'READY') return true
  return t.stored === 'CLAIMED' && t.lease !== null && t.lease.expiresAt <= now && t.report === null
}

/** Pick the highest-priority claimable task (deterministic; model-driven selection is injected). */
export function pickClaimableTask(view: MissionView, now = Date.now()): TaskView | undefined {
  const candidates = view.tasks.filter((t) => isClaimable(t, now))
  if (candidates.length === 0) return undefined
  candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  return candidates[0]
}

/** Pick the highest-priority READY task (no reclamation). Kept for compatibility. */
export function pickReadyTask(view: MissionView): TaskView | undefined {
  const ready = view.tasks.filter((t) => t.status === 'READY')
  if (ready.length === 0) return undefined
  ready.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  return ready[0]
}

/** Deterministic verifier: a task passes exactly when its process exits 0. */
export function deterministicVerifier(): TaskVerifier {
  return (_task, outcome) => ({
    passed: outcome.exitCode === 0,
    verifierType: 'deterministic',
    evidence: { exitCode: outcome.exitCode },
  })
}

/**
 * Drive the mission until terminal or no forward progress. Each step: choose a
 * claimable task (decider or deterministic) → claim (reclaiming an expired
 * lease if needed) → execute → report (declaration) → verify (independent) →
 * commit. When the mission is FAILED (stuck), ask the replanner for the next
 * revision — the fold preserves already-DONE tasks whose spec is unchanged —
 * then keep driving. Returns the current mission view.
 */
export async function driveMission(
  agent: Agent,
  mission: MissionService,
  options: DriveOptions,
): Promise<MissionView | undefined> {
  const { executor, verifier, maxSteps = 100, leaseTtlMs = 60_000, owner = 'mission-driver',
    decider, replanner, approval, maxReplans = 1 } = options
  let steps = 0
  let replans = 0
  for (;;) {
    const view = mission.status(agent)
    if (view === undefined || view.status === 'CREATED' || view.status === 'COMPLETED' || view.status === 'CANCELLED') {
      return view
    }
    if (view.status === 'FAILED') {
      if (replans >= maxReplans || replanner === undefined) return view
      const proposal = await replanner(view)
      if (approval !== undefined && !(await approval(agent, view, proposal))) return view
      mission.plan(agent, {
        revision: view.revision + 1,
        tasks: proposal.tasks,
        dependencies: proposal.dependencies,
      })
      replans++
      continue
    }
    if (steps >= maxSteps) return view
    const now = Date.now()
    const candidates = view.tasks.filter((t) => isClaimable(t, now))
    let task: TaskView | undefined
    if (decider !== undefined) task = await decider(view, candidates)
    if (task === undefined) task = pickClaimableTask(view, now)
    if (task === undefined) return view
    const token = `lease-${randomUUID()}`
    mission.claim(agent, {
      taskId: task.id,
      lease: { owner, token, expiresAt: now + leaseTtlMs, attempt: (task.lease?.attempt ?? 0) + 1 },
    })
    const outcome = await executor(agent, task)
    mission.report(agent, {
      taskId: task.id,
      token,
      exitCode: outcome.exitCode,
      ...(outcome.output === undefined ? {} : { output: outcome.output }),
    })
    const verdict = verifier(task, outcome)
    mission.verify(agent, {
      taskId: task.id,
      verifierType: verdict.verifierType,
      passed: verdict.passed,
      ...(verdict.evidence === undefined ? {} : { evidence: verdict.evidence }),
    })
    steps++
  }
}
