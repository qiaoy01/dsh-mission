// dsh-mission domain types — pure, erasable syntax only, zero runtime deps.
// Node 22 `node --experimental-strip-types` runs files importing this directly.

export type MissionStatus = 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

/** Event-written task status. READY/BLOCKED are derived, never stored. */
export type TaskStored = 'PENDING' | 'CLAIMED' | 'DONE' | 'FAILED'

/** Effective task status = stored status, plus derived READY/BLOCKED on top of PENDING. */
export type TaskStatus = TaskStored | 'READY' | 'BLOCKED'

export interface TaskSpec {
  taskId: string
  name: string
  workerType: string
  priority: number
}

export interface Dependency {
  taskId: string
  dependsOn: string
}

export interface Lease {
  owner: string
  token: string
  expiresAt: number
  attempt: number
}

export type MissionEvent =
  | { type: 'mission/created'; missionId: string; objective: string }
  | { type: 'mission/plan-committed'; missionId: string; revision: number; tasks: TaskSpec[]; dependencies: Dependency[] }
  | { type: 'mission/task-claimed'; missionId: string; taskId: string; lease: Lease }
  | { type: 'mission/task-reported'; missionId: string; taskId: string; token: string; exitCode: number; output?: unknown }
  | { type: 'mission/task-verified'; missionId: string; taskId: string; verifierType: string; passed: boolean; evidence?: unknown }
  | { type: 'mission/cancelled'; missionId: string }

export interface TaskState {
  id: string
  name: string
  workerType: string
  priority: number
  /** Event-written status (PENDING/CLAIMED/DONE/FAILED). */
  stored: TaskStored
  /** Effective status after dependency readiness derivation (adds READY/BLOCKED). */
  status: TaskStatus
  lease: Lease | null
  report: { exitCode: number; output?: unknown } | null
  verification: { verifierType: string; passed: boolean } | null
}

export interface MissionState {
  id: string
  objective: string
  /** Derived: CREATED/RUNNING/COMPLETED/FAILED; CANCELLED comes from the cancelled flag. */
  status: MissionStatus
  /** Positive revision, +1 per plan-committed; 0 before the first plan. */
  revision: number
  /** Explicit terminal flag set by mission/cancelled. */
  cancelled: boolean
  tasks: Map<string, TaskState>
  dependencies: Dependency[]
}

export type MissionWorld = Map<string, MissionState>
