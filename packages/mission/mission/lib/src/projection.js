// mission — session projection unit: the UI data plane for the mission
// domain. Plain-JSON state (persisted-cache precondition), a same-reference
// gate for non-mission events, and a view that folds the authoritative
// `foldMission` over the collected stream, so the projection can never drift
// from the domain fold. Registered under `ctx.inject(['sessionProjections'], …)`
// so headless assemblies without the registry stay unaffected.
// @module @deepseek-ai/dsh-mission/projection
import { z } from 'zod';
import { missionEventOf } from "./domain.js";
import { foldMission } from "./fold.js";
const missionProjectionSchema = z.object({
    mission: z.object({
        id: z.string().min(1),
        objective: z.string(),
        status: z.enum(['CREATED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
        revision: z.number().int().nonnegative(),
        cancelled: z.boolean(),
        tasks: z.array(z.object({
            id: z.string().min(1),
            name: z.string(),
            stored: z.enum(['PENDING', 'CLAIMED', 'DONE', 'FAILED']),
            status: z.enum(['PENDING', 'CLAIMED', 'DONE', 'FAILED', 'READY', 'BLOCKED']),
            attempt: z.number().int().nonnegative(),
        })),
        dependencies: z.array(z.object({ taskId: z.string(), dependsOn: z.string() })),
    }).nullable(),
});
export const initMissionProjection = () => ({ events: [] });
function serializeTask(t) {
    return { id: t.id, name: t.name, stored: t.stored, status: t.status, attempt: t.lease?.attempt ?? 0 };
}
function serializeMission(m) {
    return {
        id: m.id,
        objective: m.objective,
        status: m.status,
        revision: m.revision,
        cancelled: m.cancelled,
        tasks: [...m.tasks.values()].map(serializeTask),
        dependencies: m.dependencies,
    };
}
export function applyMissionProjection(state, event) {
    const me = missionEventOf(event);
    if (me === null)
        return state;
    return { events: [...state.events, me] };
}
/** View: fold the collected stream with the authoritative domain fold. */
export function viewMissionProjection(state) {
    const world = foldMission(state.events);
    const m = [...world.values()][0];
    if (m === undefined)
        return { mission: null };
    return { mission: serializeMission(m) };
}
/**
 * Register the `mission` projection unit.
 * @param ctx - context that may carry `sessionProjections`.
 */
export function apply(ctx) {
    ctx.inject(['sessionProjections'], (projectionCtx) => {
        projectionCtx.sessionProjections.register({
            key: 'mission',
            schema: missionProjectionSchema,
            init: initMissionProjection,
            apply: applyMissionProjection,
            view: viewMissionProjection,
            stateVersion: 1,
        });
    });
}
