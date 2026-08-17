// Host vocabulary of the mission domain: SessionEventMap merge, the
// mission/changed event, the session-event adapter, the error boundary, and
// service request types. Kept separate from ./types.ts (pure client-safe
// outlet) and ./fold.ts (pure fold) because these declarations pull dsh-session,
// dsh-agent, dsh-llm, and cordis into the program.
// @module @deepseek-ai/dsh-mission

import { HarnessError } from '@deepseek-ai/dsh-llm'
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { Dependency, Lease, MissionEvent, TaskSpec } from './types.ts'

/** The durable mission event vocabulary (must mirror the `SessionEventMap` merge below). */
export const MISSION_EVENT_TYPES = [
  'mission/created',
  'mission/plan-committed',
  'mission/task-claimed',
  'mission/task-reported',
  'mission/task-verified',
  'mission/cancelled',
] as const

/**
 * Register the mission event vocabulary into the harness's process-wide
 * known-event-types set. `dsh-session-persistence` refuses to replay a log
 * containing a type outside that set unless the event carries `ignorable` —
 * and the current `Session.append` has no ignorable writer. Out-of-repo
 * plugin events are outside the compiled vocabulary by construction, so this
 * runtime registration is the only way a session containing `mission/*`
 * events can be replayed by the harness this package mounts into. The set is
 * exported (typed `ReadonlySet`; runtime is a plain `Set`) — this mutation is
 * a documented bridge until the harness ships a proper registration surface.
 * Idempotent; call from every entry point before any session replay.
 */
export function registerMissionEventTypes(): void {
  const known = KNOWN_SESSION_EVENT_TYPES as unknown as Set<string>
  for (const type of MISSION_EVENT_TYPES) known.add(type)
}

// --- per-event durable payloads (SessionEventMap `data`) --------------------

export interface MissionCreatedMeta {
  missionId: string
  objective: string
}

export interface MissionPlanCommittedMeta {
  missionId: string
  revision: number
  tasks: TaskSpec[]
  dependencies: Dependency[]
}

export interface MissionTaskClaimedMeta {
  missionId: string
  taskId: string
  lease: Lease
}

export interface MissionTaskReportedMeta {
  missionId: string
  taskId: string
  token: string
  exitCode: number
  output?: unknown
}

export interface MissionTaskVerifiedMeta {
  missionId: string
  taskId: string
  verifierType: string
  passed: boolean
  evidence?: unknown
}

export interface MissionCancelledMeta {
  missionId: string
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'mission/created': MissionCreatedMeta
    'mission/plan-committed': MissionPlanCommittedMeta
    'mission/task-claimed': MissionTaskClaimedMeta
    'mission/task-reported': MissionTaskReportedMeta
    'mission/task-verified': MissionTaskVerifiedMeta
    'mission/cancelled': MissionCancelledMeta
  }
}

// --- mission/changed live notification --------------------------------------

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * A mission mutation was accepted by one live agent. The matching
     * `mission/*` session event has already committed.
     * @param payload.agent - agent whose session owns the mission.
     * @param payload.missionId - the mission that changed.
     * @mode emit
     */
    'mission/changed'(payload: { agent: Agent; missionId: string }): void
  }
}

// --- session-event adapter ---------------------------------------------------

/**
 * Convert a committed session event into a mission domain event, or `null`
 * when the event is not one of the `mission/*` types.
 */
export function missionEventOf(e: SessionEvent): MissionEvent | null {
  switch (e.type) {
    case 'mission/created':
      return { type: 'mission/created', missionId: e.data.missionId, objective: e.data.objective }
    case 'mission/plan-committed':
      return { type: 'mission/plan-committed', missionId: e.data.missionId, revision: e.data.revision, tasks: e.data.tasks, dependencies: e.data.dependencies }
    case 'mission/task-claimed':
      return { type: 'mission/task-claimed', missionId: e.data.missionId, taskId: e.data.taskId, lease: e.data.lease }
    case 'mission/task-reported':
      return { type: 'mission/task-reported', missionId: e.data.missionId, taskId: e.data.taskId, token: e.data.token, exitCode: e.data.exitCode, ...(e.data.output === undefined ? {} : { output: e.data.output }) }
    case 'mission/task-verified':
      return { type: 'mission/task-verified', missionId: e.data.missionId, taskId: e.data.taskId, verifierType: e.data.verifierType, passed: e.data.passed, ...(e.data.evidence === undefined ? {} : { evidence: e.data.evidence }) }
    case 'mission/cancelled':
      return { type: 'mission/cancelled', missionId: e.data.missionId }
    default:
      return null
  }
}

// --- error boundary ----------------------------------------------------------

/** Stable error codes for rejected mission reads and mutations. */
export type MissionErrorCode =
  | 'MISSION_AGENT_NOT_LIVE'
  | 'MISSION_NOT_FOUND'
  | 'MISSION_ALREADY_EXISTS'
  | 'MISSION_INVALID_OBJECTIVE'
  | 'MISSION_INVALID_TRANSITION'
  | 'MISSION_LLM_ROUTE_MISSING'

/** Error returned by the mission domain boundary. */
export class MissionError extends HarnessError {
  constructor(message: string, code: MissionErrorCode) {
    super(message, code)
  }
}

// --- service requests --------------------------------------------------------

export interface CreateMissionRequest {
  objective: string
}

export interface PlanRequest {
  revision: number
  tasks: TaskSpec[]
  dependencies: Dependency[]
}

export interface ClaimRequest {
  taskId: string
  lease: Lease
}

export interface ReportRequest {
  taskId: string
  token: string
  exitCode: number
  output?: unknown
}

export interface VerifyRequest {
  taskId: string
  verifierType: string
  passed: boolean
  evidence?: unknown
}
