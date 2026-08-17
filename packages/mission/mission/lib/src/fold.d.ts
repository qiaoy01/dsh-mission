import type { MissionEvent, MissionState, MissionStatus, MissionWorld, TaskSpec, TaskState, TaskStatus, TaskStored } from './types.ts';
/** Whether a task still matches its re-committed spec (name/workerType/priority). */
export declare function matchesSpec(t: TaskState, spec: TaskSpec): boolean;
/**
 * Derived effective status for one task, from its stored status and the
 * STORED statuses of its dependencies (order-independent, no recursion).
 */
export declare function effectiveTaskStatus(stored: TaskStored, deps: string[], storedOf: (id: string) => TaskStored | undefined): TaskStatus;
/**
 * Derived mission status. COMPLETED when every task is DONE; FAILED when a
 * FAILED task leaves no forward-progress task (READY/CLAIMED/PENDING) —
 * i.e. the plan is stuck until a replan supersedes it. CANCELLED is explicit.
 */
export declare function missionStatus(m: MissionState): MissionStatus;
/**
 * Fold a mission event stream into a world of mission states. Total over any
 * event list (a candidate referencing an unknown mission is created lazily);
 * validation is the invariant companion's job, not the fold's.
 */
export declare function foldMission(events: MissionEvent[]): MissionWorld;
