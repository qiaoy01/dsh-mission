import type { MissionEvent, MissionWorld } from './types.ts';
/** Whether the dependency edge set is acyclic and references only known tasks. */
export declare function isAcyclic(tasks: string[], deps: {
    taskId: string;
    dependsOn: string;
}[]): boolean;
/**
 * Validate one candidate event against the current world state (the fold of
 * all prior events). Returns a list of violations; empty means the event is
 * admissible. `now` is epoch ms, used for lease-expiry checks.
 */
export declare function validateEvent(world: MissionWorld, event: MissionEvent, now: number): string[];
