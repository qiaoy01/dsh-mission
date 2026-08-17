import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { MissionEvent, MissionState, TaskState } from './types.ts';
/** Wire summary of one task (derived statuses included; lease reduced to attempt). */
export interface MissionTaskSummary {
    id: string;
    name: string;
    stored: TaskState['stored'];
    status: TaskState['status'];
    attempt: number;
}
/** Wire summary of the current mission — a plain-JSON UI snapshot. */
export interface MissionSummary {
    id: string;
    objective: string;
    status: MissionState['status'];
    revision: number;
    cancelled: boolean;
    tasks: MissionTaskSummary[];
    dependencies: MissionState['dependencies'];
}
/** The `mission` projection value: whole current mission or pre-create null. */
export interface MissionProjectionValue {
    mission: MissionSummary | null;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        /** The session's current mission, or `null` before the first create. */
        mission: MissionProjectionValue;
    }
}
/** Plain-JSON projection state: the collected mission event stream. */
export interface MissionProjectionState {
    events: MissionEvent[];
}
export declare const initMissionProjection: () => MissionProjectionState;
export declare function applyMissionProjection(state: MissionProjectionState, event: SessionEvent): MissionProjectionState;
/** View: fold the collected stream with the authoritative domain fold. */
export declare function viewMissionProjection(state: MissionProjectionState): MissionProjectionValue;
/**
 * Register the `mission` projection unit.
 * @param ctx - context that may carry `sessionProjections`.
 */
export declare function apply(ctx: Context): void;
