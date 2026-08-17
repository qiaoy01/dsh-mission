// MissionService — event-sourced mission state with compare-and-set plan
// commits. Mirrors dsh-goal's GoalService: single current mission, revision
// monotonicity as the version guard, synchronous session append.
// @module @deepseek-ai/dsh-mission

import { randomUUID } from 'node:crypto'
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { agentEvents } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { missionEventOf, MissionError, registerMissionEventTypes } from './domain.ts'
import type {
  ClaimRequest,
  CreateMissionRequest,
  PlanRequest,
  ReportRequest,
  VerifyRequest,
} from './domain.ts'
import { foldMission } from './fold.ts'
import { validateEvent } from './validate.ts'
import type {
  Dependency,
  Lease,
  MissionEvent,
  MissionState,
  MissionStatus,
  MissionWorld,
  TaskState,
  TaskStatus,
  TaskStored,
} from './types.ts'

/** Plain-JSON task view (model-facing; no Map). */
export interface TaskView {
  id: string
  name: string
  workerType: string
  priority: number
  stored: TaskStored
  status: TaskStatus
  lease: Lease | null
  report: { exitCode: number; output?: unknown } | null
  verification: { verifierType: string; passed: boolean } | null
}

/** Plain-JSON mission view (model-facing; no Map). */
export interface MissionView {
  id: string
  objective: string
  status: MissionStatus
  revision: number
  cancelled: boolean
  tasks: TaskView[]
  dependencies: Dependency[]
}

function toTaskView(t: TaskState): TaskView {
  return {
    id: t.id,
    name: t.name,
    workerType: t.workerType,
    priority: t.priority,
    stored: t.stored,
    status: t.status,
    lease: t.lease,
    report: t.report,
    verification: t.verification,
  }
}

function toView(m: MissionState): MissionView {
  return {
    id: m.id,
    objective: m.objective,
    status: m.status,
    revision: m.revision,
    cancelled: m.cancelled,
    tasks: [...m.tasks.values()].map(toTaskView),
    dependencies: m.dependencies,
  }
}

function resolveObjective(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MissionError('mission objective must be a non-empty string', 'MISSION_INVALID_OBJECTIVE')
  }
  return value.trim()
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    mission: MissionService
  }
}

/** Mission service (`ctx.mission`) backed exclusively by the owning session log. */
export class MissionService extends Service {
  static inject = ['agents']

  constructor(ctx: Context) {
    super(ctx, 'mission')
    // Make the harness persistence reader accept mission/* events (out-of-repo
    // vocabulary is not in its compiled known-types set). Must run before any
    // session replay, so it lives on the earliest mission entry point.
    registerMissionEventTypes()
  }

  /** Read the current mission for one exact live agent. */
  status(agent: Agent): MissionView | undefined {
    const m = this.currentMission(agent)
    return m === undefined ? undefined : toView(m)
  }

  /** Create and return a new mission. */
  create(agent: Agent, request: CreateMissionRequest): MissionView {
    const objective = resolveObjective(request.objective)
    this.assertLive(agent)
    if (this.currentMission(agent) !== undefined) {
      throw new MissionError('a mission already exists in this session', 'MISSION_ALREADY_EXISTS')
    }
    const missionId = `mission-${randomUUID()}`
    this.commit(agent, { type: 'mission/created', missionId, objective })
    return toView(this.requireMission(agent))
  }

  /** Commit a full plan snapshot (CAS: revision must be current + 1). */
  plan(agent: Agent, request: PlanRequest): MissionView {
    const current = this.requireMission(agent)
    this.commit(agent, {
      type: 'mission/plan-committed',
      missionId: current.id,
      revision: request.revision,
      tasks: request.tasks,
      dependencies: request.dependencies,
    })
    return toView(this.requireMission(agent))
  }

  /** Claim a READY task with a lease. */
  claim(agent: Agent, request: ClaimRequest): MissionView {
    const current = this.requireMission(agent)
    this.commit(agent, { type: 'mission/task-claimed', missionId: current.id, taskId: request.taskId, lease: request.lease })
    return toView(this.requireMission(agent))
  }

  /** Record a task's declaration against the environment (does not set DONE). */
  report(agent: Agent, request: ReportRequest): MissionView {
    const current = this.requireMission(agent)
    this.commit(agent, {
      type: 'mission/task-reported',
      missionId: current.id,
      taskId: request.taskId,
      token: request.token,
      exitCode: request.exitCode,
      ...(request.output === undefined ? {} : { output: request.output }),
    })
    return toView(this.requireMission(agent))
  }

  /** Independently align a task's declaration with the environment → DONE/FAILED. */
  verify(agent: Agent, request: VerifyRequest): MissionView {
    const current = this.requireMission(agent)
    this.commit(agent, {
      type: 'mission/task-verified',
      missionId: current.id,
      taskId: request.taskId,
      verifierType: request.verifierType,
      passed: request.passed,
      ...(request.evidence === undefined ? {} : { evidence: request.evidence }),
    })
    return toView(this.requireMission(agent))
  }

  /** Explicitly cancel the current mission. */
  cancel(agent: Agent): MissionView {
    const current = this.requireMission(agent)
    this.commit(agent, { type: 'mission/cancelled', missionId: current.id })
    return toView(this.requireMission(agent))
  }

  /** Enforce exact live-agent identity rather than trusting a matching id. */
  private assertLive(agent: Agent): void {
    if (this.ctx.agents.get(agent.id) !== agent) {
      throw new MissionError(`agent "${agent.id}" is not live in this registry`, 'MISSION_AGENT_NOT_LIVE')
    }
  }

  /** Fold the committed mission events of one session into a world. */
  private foldWorld(agent: Agent): MissionWorld {
    const events: MissionEvent[] = []
    for (const event of agent.session.events) {
      const me = missionEventOf(event)
      if (me !== null) events.push(me)
    }
    return foldMission(events)
  }

  /** The single current mission state, or undefined before creation. */
  private currentMission(agent: Agent): MissionState | undefined {
    this.assertLive(agent)
    return [...this.foldWorld(agent).values()][0]
  }

  private requireMission(agent: Agent): MissionState {
    const m = this.currentMission(agent)
    if (m === undefined) throw new MissionError('no current mission', 'MISSION_NOT_FOUND')
    return m
  }

  /** Validate one candidate event against the current fold, then append it. */
  private commit(agent: Agent, event: MissionEvent): void {
    this.assertLive(agent)
    const violations = validateEvent(this.foldWorld(agent), event, Date.now())
    if (violations.length > 0) {
      throw new MissionError(violations.join('; '), 'MISSION_INVALID_TRANSITION')
    }
    switch (event.type) {
      case 'mission/created':
        agent.session.append('mission/created', { missionId: event.missionId, objective: event.objective })
        break
      case 'mission/plan-committed':
        agent.session.append('mission/plan-committed', { missionId: event.missionId, revision: event.revision, tasks: event.tasks, dependencies: event.dependencies })
        break
      case 'mission/task-claimed':
        agent.session.append('mission/task-claimed', { missionId: event.missionId, taskId: event.taskId, lease: event.lease })
        break
      case 'mission/task-reported':
        agent.session.append('mission/task-reported', { missionId: event.missionId, taskId: event.taskId, token: event.token, exitCode: event.exitCode, ...(event.output === undefined ? {} : { output: event.output }) })
        break
      case 'mission/task-verified':
        agent.session.append('mission/task-verified', { missionId: event.missionId, taskId: event.taskId, verifierType: event.verifierType, passed: event.passed, ...(event.evidence === undefined ? {} : { evidence: event.evidence }) })
        break
      case 'mission/cancelled':
        agent.session.append('mission/cancelled', { missionId: event.missionId })
        break
    }
    // Scoped live notification: the driver host and any UI projection react
    // to committed mission mutations. The matching `mission/*` session event
    // has already committed when listeners run.
    agentEvents(this.ctx, agent).emit('mission/changed', { missionId: event.missionId })
  }
}

export default MissionService
