import { HarnessError } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { Dependency, Lease, MissionEvent, TaskSpec } from './types.ts';
/** The durable mission event vocabulary (must mirror the `SessionEventMap` merge below). */
export declare const MISSION_EVENT_TYPES: readonly ["mission/created", "mission/plan-committed", "mission/task-claimed", "mission/task-reported", "mission/task-verified", "mission/cancelled"];
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
export declare function registerMissionEventTypes(): void;
export interface MissionCreatedMeta {
    missionId: string;
    objective: string;
}
export interface MissionPlanCommittedMeta {
    missionId: string;
    revision: number;
    tasks: TaskSpec[];
    dependencies: Dependency[];
}
export interface MissionTaskClaimedMeta {
    missionId: string;
    taskId: string;
    lease: Lease;
}
export interface MissionTaskReportedMeta {
    missionId: string;
    taskId: string;
    token: string;
    exitCode: number;
    output?: unknown;
}
export interface MissionTaskVerifiedMeta {
    missionId: string;
    taskId: string;
    verifierType: string;
    passed: boolean;
    evidence?: unknown;
}
export interface MissionCancelledMeta {
    missionId: string;
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        'mission/created': MissionCreatedMeta;
        'mission/plan-committed': MissionPlanCommittedMeta;
        'mission/task-claimed': MissionTaskClaimedMeta;
        'mission/task-reported': MissionTaskReportedMeta;
        'mission/task-verified': MissionTaskVerifiedMeta;
        'mission/cancelled': MissionCancelledMeta;
    }
}
declare module '@deepseek-ai/cordis' {
    interface Events {
        /**
         * A mission mutation was accepted by one live agent. The matching
         * `mission/*` session event has already committed.
         * @param payload.agent - agent whose session owns the mission.
         * @param payload.missionId - the mission that changed.
         * @mode emit
         */
        'mission/changed'(payload: {
            agent: Agent;
            missionId: string;
        }): void;
    }
}
/**
 * Convert a committed session event into a mission domain event, or `null`
 * when the event is not one of the `mission/*` types.
 */
export declare function missionEventOf(e: SessionEvent): MissionEvent | null;
/** Stable error codes for rejected mission reads and mutations. */
export type MissionErrorCode = 'MISSION_AGENT_NOT_LIVE' | 'MISSION_NOT_FOUND' | 'MISSION_ALREADY_EXISTS' | 'MISSION_INVALID_OBJECTIVE' | 'MISSION_INVALID_TRANSITION' | 'MISSION_LLM_ROUTE_MISSING';
/** Error returned by the mission domain boundary. */
export declare class MissionError extends HarnessError {
    constructor(message: string, code: MissionErrorCode);
}
export interface CreateMissionRequest {
    objective: string;
}
export interface PlanRequest {
    revision: number;
    tasks: TaskSpec[];
    dependencies: Dependency[];
}
export interface ClaimRequest {
    taskId: string;
    lease: Lease;
}
export interface ReportRequest {
    taskId: string;
    token: string;
    exitCode: number;
    output?: unknown;
}
export interface VerifyRequest {
    taskId: string;
    verifierType: string;
    passed: boolean;
    evidence?: unknown;
}
