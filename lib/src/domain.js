// Host vocabulary of the mission domain: SessionEventMap merge, the
// mission/changed event, the session-event adapter, the error boundary, and
// service request types. Kept separate from ./types.ts (pure client-safe
// outlet) and ./fold.ts (pure fold) because these declarations pull dsh-session,
// dsh-agent, dsh-llm, and cordis into the program.
// @module @deepseek-ai/dsh-mission
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session';
/** The durable mission event vocabulary (must mirror the `SessionEventMap` merge below). */
export const MISSION_EVENT_TYPES = [
    'mission/created',
    'mission/plan-committed',
    'mission/task-claimed',
    'mission/task-reported',
    'mission/task-verified',
    'mission/cancelled',
];
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
export function registerMissionEventTypes() {
    const known = KNOWN_SESSION_EVENT_TYPES;
    for (const type of MISSION_EVENT_TYPES)
        known.add(type);
}
// --- session-event adapter ---------------------------------------------------
/**
 * Convert a committed session event into a mission domain event, or `null`
 * when the event is not one of the `mission/*` types.
 */
export function missionEventOf(e) {
    switch (e.type) {
        case 'mission/created':
            return { type: 'mission/created', missionId: e.data.missionId, objective: e.data.objective };
        case 'mission/plan-committed':
            return { type: 'mission/plan-committed', missionId: e.data.missionId, revision: e.data.revision, tasks: e.data.tasks, dependencies: e.data.dependencies };
        case 'mission/task-claimed':
            return { type: 'mission/task-claimed', missionId: e.data.missionId, taskId: e.data.taskId, lease: e.data.lease };
        case 'mission/task-reported':
            return { type: 'mission/task-reported', missionId: e.data.missionId, taskId: e.data.taskId, token: e.data.token, exitCode: e.data.exitCode, ...(e.data.output === undefined ? {} : { output: e.data.output }) };
        case 'mission/task-verified':
            return { type: 'mission/task-verified', missionId: e.data.missionId, taskId: e.data.taskId, verifierType: e.data.verifierType, passed: e.data.passed, ...(e.data.evidence === undefined ? {} : { evidence: e.data.evidence }) };
        case 'mission/cancelled':
            return { type: 'mission/cancelled', missionId: e.data.missionId };
        default:
            return null;
    }
}
/** Error returned by the mission domain boundary. */
export class MissionError extends HarnessError {
    constructor(message, code) {
        super(message, code);
    }
}
